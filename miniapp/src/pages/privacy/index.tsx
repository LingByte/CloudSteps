/**
 * 隐私政策 — 对齐 web/src/pages/Privacy.tsx。
 */
import { View, Text, ScrollView } from '@tarojs/components'
import './index.scss'

export default function Privacy() {
  return (
    <ScrollView className="doc" scrollY enableFlex>
      <View className="doc__card">
        <Text className="doc__intro">
          解忧（CloudSteps，以下称「我们」）深知个人信息对你的重要性。本政策说明我们如何收集、使用、存储、共享与保护你的个人信息，以及你如何行使权利。
          请在使用前仔细阅读。涉及敏感信息或需单独同意的事项，我们将依法另行征得同意。
        </Text>

        <View className="doc__section">
          <Text className="doc__h2">1. 我们收集的信息</Text>
          <Text className="doc__p">为实现学习、陪练与账户安全等目的，我们可能收集：</Text>
          <View className="doc__list">
            <Text className="doc__list-item">• 账户信息：邮箱、手机号（如绑定）、昵称、头像、角色、登录凭证；</Text>
            <Text className="doc__list-item">• 学习数据：词库选择、识记/复习进度、测试结果、训练记录、口语相关数据；</Text>
            <Text className="doc__list-item">• 教练业务数据：学员档案、课时、预约与备注（仅授权角色可见）；</Text>
            <Text className="doc__list-item">• 设备与日志：设备型号、系统、IP、操作与崩溃日志（用于安全与排障）；</Text>
            <Text className="doc__list-item">• 你主动提供的反馈、联系方式及自定义内容；本地缓存的偏好与登录状态。</Text>
          </View>
        </View>

        <View className="doc__section">
          <Text className="doc__h2">2. 使用目的</Text>
          <Text className="doc__p">
            用于账户维护、提供学习与教练功能、展示学习进度、语音相关处理、服务通知、安全风控、产品改进，以及履行法定义务。我们不会强制收集与服务无关的信息。
          </Text>
        </View>

        <View className="doc__section">
          <Text className="doc__h2">3. 存储与保护</Text>
          <Text className="doc__p">
            我们在中华人民共和国境内存储个人信息，仅在实现目的所必需的期限内保留，到期删除或匿名化（法律另有规定除外）。
            我们采取访问控制、加密、权限分级等措施；互联网并非绝对安全，请妥善保管账户。
          </Text>
        </View>

        <View className="doc__section">
          <Text className="doc__h2">4. 共享与第三方</Text>
          <Text className="doc__p">
            我们不会出售个人信息。仅在你同意、履行法律义务、保护重大合法权益，或为登录/存储/语音等必要服务在最小范围内委托处理时共享，并要求对方保密。
            接入的第三方 SDK 可能按其自身政策处理信息，请一并阅读。
          </Text>
        </View>

        <View className="doc__section">
          <Text className="doc__h2">5. 未成年人保护</Text>
          <Text className="doc__p">
            未成年人请在监护人指导下使用。我们仅在法律允许、监护人同意或保护未成年人必要情形下处理相关信息。如有疑问请通过反馈渠道联系我们。
          </Text>
        </View>

        <View className="doc__section">
          <Text className="doc__h2">6. 你的权利</Text>
          <Text className="doc__p">
            你有权查阅、更正、删除个人信息，撤回同意或申请注销账户（法律要求保留的除外）。可通过设置、个人中心或「意见反馈」提出请求，我们将在核实后合理期限内答复。
          </Text>
        </View>

        <View className="doc__section">
          <Text className="doc__h2">7. 政策更新与联系</Text>
          <Text className="doc__p">
            我们可能更新本政策，重大变更将以合理方式提示。疑问、投诉或建议请通过产品内「意见反馈」联系我们。
          </Text>
        </View>
      </View>

      <View className="doc__footer">
        <Text className="doc__footer-text">更新日期：2026-08-29</Text>
      </View>
    </ScrollView>
  )
}
