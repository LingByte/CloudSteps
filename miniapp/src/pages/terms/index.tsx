/**
 * 用户协议 — 对齐 web/src/pages/Terms.tsx。
 */
import { View, Text, ScrollView } from '@tarojs/components'
import './index.scss'

export default function Terms() {
  return (
    <ScrollView className="doc" scrollY enableFlex>
      <View className="doc__card">
        <Text className="doc__intro">
          欢迎使用解忧（CloudSteps，以下称「本产品」或「本服务」）。本协议由你与解忧平台运营方（以下称「我们」）共同缔结，具有合同效力。
          你注册、登录或以其他方式使用本服务，即视为已阅读、理解并同意本协议。如不同意，请立即停止使用。
        </Text>
        <Text className="doc__p">
          本产品面向语言学习与教练陪练场景，提供词库学习、词汇测试、单词训练、复习计划、学习记录、学员管理、课程预约、情景口语等功能（具体以产品实际提供为准）。
        </Text>

        <View className="doc__section">
          <Text className="doc__h2">1. 账户与使用资格</Text>
          <Text className="doc__p">
            你应具备完全民事行为能力；未成年人须在监护人同意下使用。你应保证注册信息真实、准确，并妥善保管账户与认证信息。禁止冒用他人身份、转让或出借账户。
          </Text>
        </View>

        <View className="doc__section">
          <Text className="doc__h2">2. 服务内容与变更</Text>
          <Text className="doc__p">
            我们提供与语言学习、训练管理相关的产品功能与技术服务。我们有权基于业务、合规或技术需要调整、中断或终止部分服务，并以合理方式告知。部分功能可能依赖网络及第三方服务。
          </Text>
        </View>

        <View className="doc__section">
          <Text className="doc__h2">3. 用户行为规范</Text>
          <Text className="doc__p">你不得从事以下行为：</Text>
          <View className="doc__list">
            <Text className="doc__list-item">• 违反法律法规、监管政策或公序良俗；</Text>
            <Text className="doc__list-item">• 侵害他人合法权益（含隐私权、知识产权等）；</Text>
            <Text className="doc__list-item">• 未经授权干扰、破坏系统或数据（含恶意爬虫、注入等）；</Text>
            <Text className="doc__list-item">• 发布违法、欺诈、骚扰或不良信息，或利用服务作弊、刷量；</Text>
            <Text className="doc__list-item">• 擅自复制、传播词库等内容用于商业目的。</Text>
          </View>
        </View>

        <View className="doc__section">
          <Text className="doc__h2">4. 学习内容与知识产权</Text>
          <Text className="doc__p">
            产品界面、标识、软件、词库编排等知识产权归我们或相关权利人所有。你上传的内容须保证不侵权，并授予我们为提供服务所必需的使用权。
          </Text>
        </View>

        <View className="doc__section">
          <Text className="doc__h2">5. 教练与学员</Text>
          <Text className="doc__p">
            教练使用学员管理、排课等功能时，应确保已获学员或其监护人合法授权。我们为技术平台方，不对教练与学员之间的线下约定或教学效果作保证（法律另有规定除外）。
          </Text>
        </View>

        <View className="doc__section">
          <Text className="doc__h2">6. 免责声明</Text>
          <Text className="doc__p">
            我们将尽力保障服务可用，但不保证不中断、无错误或必然达成特定学习目标。因不可抗力、网络故障、第三方原因等导致的异常，我们在法律允许范围内依法免责或减轻责任。
          </Text>
        </View>

        <View className="doc__section">
          <Text className="doc__h2">7. 协议变更与终止</Text>
          <Text className="doc__p">
            我们可更新本协议，更新后自公布或提示之日起生效。继续使用视为接受；不同意应停止使用并可申请注销。严重违约时，我们可中止或终止服务。
          </Text>
        </View>

        <View className="doc__section">
          <Text className="doc__h2">8. 法律适用与联系</Text>
          <Text className="doc__p">
            本协议适用中华人民共和国法律。争议应友好协商；协商不成可向我们住所地有管辖权的人民法院起诉。疑问可通过产品内「意见反馈」联系我们。
          </Text>
        </View>
      </View>

      <View className="doc__footer">
        <Text className="doc__footer-text">生效日期：2026-08-29</Text>
      </View>
    </ScrollView>
  )
}
