package wechatpay

import (
	"bytes"
	"crypto"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

const apiHost = "https://api.mch.weixin.qq.com"

// Client 微信支付 API v3。
type Client struct {
	MchID      string
	AppID      string
	APIv3Key   string
	NotifyURL  string
	SerialNo   string
	privateKey *rsa.PrivateKey

	mu             sync.Mutex
	platformCerts  map[string]*rsa.PublicKey
	platformLoaded time.Time
}

func Load(mchID, appID, apiV3Key, certFile, keyFile, notifyURL string) (*Client, error) {
	if mchID == "" || appID == "" || len(apiV3Key) != 32 {
		return nil, errors.New("wechat pay config incomplete")
	}
	certPEM, err := readFile(certFile)
	if err != nil {
		return nil, fmt.Errorf("read pay cert: %w", err)
	}
	keyPEM, err := readFile(keyFile)
	if err != nil {
		return nil, fmt.Errorf("read pay key: %w", err)
	}
	serial, err := certSerial(certPEM)
	if err != nil {
		return nil, err
	}
	key, err := parsePrivateKey(keyPEM)
	if err != nil {
		return nil, err
	}
	return &Client{
		MchID:         mchID,
		AppID:         appID,
		APIv3Key:      apiV3Key,
		NotifyURL:     notifyURL,
		SerialNo:      serial,
		privateKey:    key,
		platformCerts: map[string]*rsa.PublicKey{},
	}, nil
}

// JSAPIOrder 下单并返回调起支付参数。
func (c *Client) JSAPIOrder(description, outTradeNo, openID string, amountFen int) (prepayID string, payParams map[string]string, err error) {
	body := map[string]any{
		"appid":        c.AppID,
		"mchid":        c.MchID,
		"description":  description,
		"out_trade_no": outTradeNo,
		"notify_url":   c.NotifyURL,
		"amount":       map[string]any{"total": amountFen, "currency": "CNY"},
		"payer":        map[string]string{"openid": openID},
	}
	raw, _ := json.Marshal(body)
	respBody, err := c.do(http.MethodPost, "/v3/pay/transactions/jsapi", raw)
	if err != nil {
		return "", nil, err
	}
	var parsed struct {
		PrepayID string `json:"prepay_id"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil || parsed.PrepayID == "" {
		return "", nil, fmt.Errorf("wechat pay prepay: %s", string(respBody))
	}
	params, err := c.PayParams(parsed.PrepayID)
	if err != nil {
		return "", nil, err
	}
	return parsed.PrepayID, params, nil
}

// NativeOrder 下单并返回用于生成二维码的 code_url。
func (c *Client) NativeOrder(description, outTradeNo string, amountFen int) (string, error) {
	body := map[string]any{
		"appid":        c.AppID,
		"mchid":        c.MchID,
		"description":  description,
		"out_trade_no": outTradeNo,
		"notify_url":   c.NotifyURL,
		"amount":       map[string]any{"total": amountFen, "currency": "CNY"},
	}
	raw, _ := json.Marshal(body)
	respBody, err := c.do(http.MethodPost, "/v3/pay/transactions/native", raw)
	if err != nil {
		return "", err
	}
	var parsed struct {
		CodeURL string `json:"code_url"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil || parsed.CodeURL == "" {
		return "", fmt.Errorf("wechat pay native: %s", string(respBody))
	}
	return parsed.CodeURL, nil
}

// PayParams 用商户私钥签 JSAPI 调起参数。
func (c *Client) PayParams(prepayID string) (map[string]string, error) {
	ts := fmt.Sprintf("%d", time.Now().Unix())
	nonce, err := randomNonce()
	if err != nil {
		return nil, err
	}
	pkg := "prepay_id=" + prepayID
	message := c.AppID + "\n" + ts + "\n" + nonce + "\n" + pkg + "\n"
	sign, err := c.sign(message)
	if err != nil {
		return nil, err
	}
	return map[string]string{
		"appId":     c.AppID,
		"timeStamp": ts,
		"nonceStr":  nonce,
		"package":   pkg,
		"signType":  "RSA",
		"paySign":   sign,
	}, nil
}

// QueryTradeState 按商户订单号查单。
func (c *Client) QueryTradeState(outTradeNo string) (string, string, error) {
	path := fmt.Sprintf("/v3/pay/transactions/out-trade-no/%s?mchid=%s", outTradeNo, c.MchID)
	body, err := c.do(http.MethodGet, path, nil)
	if err != nil {
		return "", "", err
	}
	var parsed struct {
		TradeState    string `json:"trade_state"`
		TransactionID string `json:"transaction_id"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", "", err
	}
	return parsed.TradeState, parsed.TransactionID, nil
}

// VerifyNotify 验签并解密支付回调，返回明文 JSON。
func (c *Client) VerifyNotify(timestamp, nonce, signature, serial string, body []byte) ([]byte, error) {
	message := timestamp + "\n" + nonce + "\n" + string(body) + "\n"
	pub, err := c.platformPublicKey(serial)
	if err != nil {
		return nil, err
	}
	sig, err := base64.StdEncoding.DecodeString(signature)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256([]byte(message))
	if err := rsa.VerifyPKCS1v15(pub, crypto.SHA256, sum[:], sig); err != nil {
		return nil, fmt.Errorf("wechat pay notify signature: %w", err)
	}
	var envelope struct {
		Resource struct {
			Algorithm      string `json:"algorithm"`
			Ciphertext     string `json:"ciphertext"`
			Nonce          string `json:"nonce"`
			AssociatedData string `json:"associated_data"`
		} `json:"resource"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		return nil, err
	}
	return decryptAESGCM(c.APIv3Key, envelope.Resource.Nonce, envelope.Resource.AssociatedData, envelope.Resource.Ciphertext)
}

func (c *Client) platformPublicKey(serial string) (*rsa.PublicKey, error) {
	c.mu.Lock()
	if key := c.platformCerts[serial]; key != nil {
		c.mu.Unlock()
		return key, nil
	}
	stale := time.Since(c.platformLoaded) < 10*time.Minute && len(c.platformCerts) > 0
	c.mu.Unlock()
	if stale {
		return nil, fmt.Errorf("unknown wechat pay platform serial %s", serial)
	}
	if err := c.refreshPlatformCerts(); err != nil {
		return nil, err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if key := c.platformCerts[serial]; key != nil {
		return key, nil
	}
	return nil, fmt.Errorf("unknown wechat pay platform serial %s", serial)
}

func (c *Client) refreshPlatformCerts() error {
	body, err := c.do(http.MethodGet, "/v3/certificates", nil)
	if err != nil {
		return err
	}
	var parsed struct {
		Data []struct {
			SerialNo           string `json:"serial_no"`
			EncryptCertificate struct {
				Nonce          string `json:"nonce"`
				AssociatedData string `json:"associated_data"`
				Ciphertext     string `json:"ciphertext"`
			} `json:"encrypt_certificate"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return err
	}
	next := map[string]*rsa.PublicKey{}
	for _, item := range parsed.Data {
		plain, err := decryptAESGCM(c.APIv3Key, item.EncryptCertificate.Nonce, item.EncryptCertificate.AssociatedData, item.EncryptCertificate.Ciphertext)
		if err != nil {
			return err
		}
		block, _ := pem.Decode(plain)
		if block == nil {
			return errors.New("platform cert pem")
		}
		cert, err := x509.ParseCertificate(block.Bytes)
		if err != nil {
			return err
		}
		pub, ok := cert.PublicKey.(*rsa.PublicKey)
		if !ok {
			return errors.New("platform cert is not rsa")
		}
		next[item.SerialNo] = pub
	}
	c.mu.Lock()
	c.platformCerts = next
	c.platformLoaded = time.Now()
	c.mu.Unlock()
	return nil
}

func (c *Client) do(method, path string, body []byte) ([]byte, error) {
	ts := fmt.Sprintf("%d", time.Now().Unix())
	nonce, err := randomNonce()
	if err != nil {
		return nil, err
	}
	message := method + "\n" + path + "\n" + ts + "\n" + nonce + "\n" + string(body) + "\n"
	sign, err := c.sign(message)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest(method, apiHost+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf(
		`WECHATPAY2-SHA256-RSA2048 mchid="%s",nonce_str="%s",signature="%s",timestamp="%s",serial_no="%s"`,
		c.MchID, nonce, sign, ts, c.SerialNo,
	))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("wechat pay %s %s: %s", method, path, string(respBody))
	}
	return respBody, nil
}

func (c *Client) sign(message string) (string, error) {
	sum := sha256.Sum256([]byte(message))
	sig, err := rsa.SignPKCS1v15(rand.Reader, c.privateKey, crypto.SHA256, sum[:])
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(sig), nil
}

func decryptAESGCM(apiV3Key, nonce, aad, ciphertextB64 string) ([]byte, error) {
	raw, err := base64.StdEncoding.DecodeString(ciphertextB64)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher([]byte(apiV3Key))
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return gcm.Open(nil, []byte(nonce), raw, []byte(aad))
}

func certSerial(certPEM []byte) (string, error) {
	block, _ := pem.Decode(certPEM)
	if block == nil {
		return "", errors.New("pay cert pem")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return "", err
	}
	return strings.ToUpper(cert.SerialNumber.Text(16)), nil
}

func parsePrivateKey(keyPEM []byte) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode(keyPEM)
	if block == nil {
		return nil, errors.New("pay key pem")
	}
	if key, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
		rsaKey, ok := key.(*rsa.PrivateKey)
		if !ok {
			return nil, errors.New("pay key is not rsa")
		}
		return rsaKey, nil
	}
	return x509.ParsePKCS1PrivateKey(block.Bytes)
}

func randomNonce() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", buf), nil
}

func readFile(path string) ([]byte, error) {
	return os.ReadFile(path)
}
