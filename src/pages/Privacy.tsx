export default function Privacy() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h1 className="text-slate-900 text-2xl font-semibold">隐私政策</h1>
        <p className="text-slate-500 text-sm mt-2">更新日期：2026-03-26</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5 text-slate-700 leading-relaxed">
        <p>
          我们非常重视你的个人信息保护。本隐私政策旨在说明我们如何收集、使用、存储、共享与保护你的个人信息，以及你如何行使相关权利。
          你在使用云阶（CloudSteps）服务前，请仔细阅读并理解本政策。
        </p>

        <section className="space-y-2">
          <h2 className="text-slate-900 font-semibold text-lg">1. 我们收集的信息</h2>
          <p>
            为提供服务，我们可能收集以下信息：
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>账户信息：邮箱、昵称、头像（如你提供）。</li>
            <li>可选信息：手机号、地区、时区等（用于完善资料或提升体验）。</li>
            <li>日志信息：设备信息、浏览/操作日志、IP 地址、登录时间等（用于安全与风控）。</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-slate-900 font-semibold text-lg">2. 信息的使用目的</h2>
          <p>
            我们使用个人信息可能用于：提供与改进服务、账号安全与身份验证、故障排查与性能优化、合规要求等。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-slate-900 font-semibold text-lg">3. 信息的存储与保护</h2>
          <p>
            我们采取合理可行的技术与管理措施保护你的信息安全，包括访问控制、加密传输、审计与权限管理等。
            但互联网环境并非绝对安全，我们将尽最大努力降低风险。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-slate-900 font-semibold text-lg">4. 信息共享、转让与公开披露</h2>
          <p>
            我们不会向第三方出售你的个人信息。
            仅在以下情形可能共享、转让或公开披露：获得你的明确同意；法律法规要求；为维护你或公众的重大合法权益；与必要的服务提供方在最小范围内共享以实现产品功能。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-slate-900 font-semibold text-lg">5. 你的权利</h2>
          <p>
            你有权访问、更正或删除你的个人信息，并可通过产品内的设置/个人资料页面修改部分信息。
            在适用法律允许范围内，你也可以撤回同意或注销账户。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-slate-900 font-semibold text-lg">6. 政策更新</h2>
          <p>
            我们可能适时更新本政策。若变更对你的权利义务造成重大影响，我们将以弹窗、站内信或其他合理方式提示。
          </p>
        </section>
      </div>
    </div>
  );
}
