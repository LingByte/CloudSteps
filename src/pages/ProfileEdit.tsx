import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { CloudButton } from "@/components/cloudsteps";
import { updateCurrentUser } from "@/api/auth";
import { useAuthStore } from "@/stores/authStore";
import Select from "@/components/ui/select";

export default function ProfileEdit() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const refreshUserInfo = useAuthStore((s) => s.refreshUserInfo);

  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [timezone, setTimezone] = useState("");

  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const stats = useMemo(() => {
    return [
      { label: "登录次数", value: String((user as any)?.loginCount ?? "-") },
      {
        label: "资料完整度",
        value:
          typeof (user as any)?.profileComplete === "number"
            ? `${(user as any).profileComplete}%`
            : "-",
      },
      {
        label: "连续学习",
        value:
          typeof (user as any)?.streakDays === "number" ? `${(user as any).streakDays}天` : "-",
      },
    ];
  }, [user]);

  useEffect(() => {
    setDisplayName(user?.displayName ?? "");
    setPhone(user?.phone ?? "");
    setRegion(user?.region ?? "");
    setCity(user?.city ?? "");
    setTimezone(user?.timezone ?? "");
  }, [user]);

  const canSave = useMemo(() => {
    return !saving;
  }, [saving]);

  const timezoneOptions = useMemo(
    () => [
      { value: "Asia/Shanghai", label: "Asia/Shanghai (中国标准时间)" },
      { value: "Asia/Hong_Kong", label: "Asia/Hong_Kong" },
      { value: "Asia/Taipei", label: "Asia/Taipei" },
      { value: "Asia/Singapore", label: "Asia/Singapore" },
      { value: "Asia/Tokyo", label: "Asia/Tokyo" },
      { value: "America/Los_Angeles", label: "America/Los_Angeles" },
      { value: "America/New_York", label: "America/New_York" },
      { value: "Europe/London", label: "Europe/London" },
      { value: "Europe/Paris", label: "Europe/Paris" },
    ],
    [],
  );

  const onSave = async () => {
    setErrorText(null);

    if (!displayName.trim()) {
      setErrorText("请输入昵称");
      return;
    }

    try {
      setSaving(true);
      const res = await updateCurrentUser({
        displayName: displayName.trim(),
        phone: phone.trim(),
        region: region.trim(),
        city: city.trim(),
        timezone: timezone.trim(),
      });

      if (res.code !== 200) {
        setErrorText(res.msg || "保存失败");
        return;
      }

      await refreshUserInfo();
      navigate("/coach-center", { replace: true });
    } catch (e: any) {
      setErrorText(e?.msg || e?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-slate-900 text-xl font-semibold">编辑个人资料</div>
            <div className="text-slate-500 text-sm mt-1">账号：{user?.email || "-"}</div>
          </div>
          <CloudButton
            onClick={() => navigate(-1)}
            className="h-9 px-4 rounded-lg border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 transition-all duration-200 hover:shadow-sm active:scale-[0.99]"
          >
            返回
          </CloudButton>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs text-slate-500">{s.label}</div>
              <div className="text-lg font-semibold text-slate-900 mt-1">{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
        <div>
          <div className="text-sm text-slate-700 font-medium mb-2">昵称</div>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="请输入昵称"
            className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 transition-all duration-200 outline-none hover:border-slate-300 hover:shadow-sm focus:border-[#4ECDC4] focus:ring-2 focus:ring-[#4ECDC4]/20 active:scale-[0.99]"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-slate-700 font-medium mb-2">手机号</div>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="请输入手机号"
              className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 transition-all duration-200 outline-none hover:border-slate-300 hover:shadow-sm focus:border-[#4ECDC4] focus:ring-2 focus:ring-[#4ECDC4]/20 active:scale-[0.99]"
            />
          </div>

          <div>
            <div className="text-sm text-slate-700 font-medium mb-2">时区</div>
            <Select
              value={timezone}
              onValueChange={setTimezone}
              options={timezoneOptions}
              placeholder="请选择时区"
              className="w-full"
            />
          </div>

          <div>
            <div className="text-sm text-slate-700 font-medium mb-2">地区</div>
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="例如：中国"
              className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 transition-all duration-200 outline-none hover:border-slate-300 hover:shadow-sm focus:border-[#4ECDC4] focus:ring-2 focus:ring-[#4ECDC4]/20 active:scale-[0.99]"
            />
          </div>

          <div>
            <div className="text-sm text-slate-700 font-medium mb-2">城市</div>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="例如：深圳"
              className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 transition-all duration-200 outline-none hover:border-slate-300 hover:shadow-sm focus:border-[#4ECDC4] focus:ring-2 focus:ring-[#4ECDC4]/20 active:scale-[0.99]"
            />
          </div>
        </div>

        {errorText ? (
          <div className="text-sm text-[#FF6B6B] bg-[#FF6B6B]/5 border border-[#FF6B6B]/20 rounded-xl px-4 py-3">
            {errorText}
          </div>
        ) : null}

        <div className="pt-2 flex items-center justify-end">
          <CloudButton
            onClick={onSave}
            disabled={!canSave}
            className="h-11 px-6 rounded-xl font-medium bg-[#4ECDC4] text-white hover:bg-[#45b8b0] transition-all duration-200 hover:shadow-md active:scale-[0.99] disabled:opacity-50 disabled:hover:shadow-none"
          >
            {saving ? (
              <span className="inline-flex items-center justify-center gap-2">
                <span className="inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                <span>保存中...</span>
              </span>
            ) : (
              "保存"
            )}
          </CloudButton>
        </div>
      </div>
    </div>
  );
}
