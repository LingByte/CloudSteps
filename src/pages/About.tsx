export default function About() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h1 className="text-slate-900 text-2xl font-semibold">关于我们</h1>
        <p className="text-slate-500 text-sm mt-2">
          更新日期：2026-03-26
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 text-slate-700 leading-relaxed">
        <p>
          云阶（CloudSteps）是一款面向语言学习与训练场景的产品，致力于为学习者与教练/陪练提供更高效、可追踪、可持续的学习与训练体验。
          我们提供与学习相关的功能模块，包括但不限于训练记录、复习计划、学习提醒、个人中心与账户设置等。
        </p>
        <p>
          我们重视用户体验与信息安全，持续改进服务的稳定性与可用性。
          若你在使用过程中遇到问题或希望提出建议，可以通过产品内的反馈渠道与我们取得联系。
        </p>
        <div>
          <h2 className="text-slate-900 font-semibold text-lg">服务范围</h2>
          <p className="mt-2">
            我们提供的服务可能因地区、版本与运营策略而有所不同。你使用本产品即视为理解并接受我们在应用内或官网公布的服务内容。
          </p>
        </div>
        <div>
          <h2 className="text-slate-900 font-semibold text-lg">合规与透明</h2>
          <p className="mt-2">
            我们会根据适用法律法规及监管要求持续完善合规体系，并在必要时更新《用户协议》与《隐私政策》。重要变更将以合理方式提示。
          </p>
        </div>
      </div>
    </div>
  );
}
