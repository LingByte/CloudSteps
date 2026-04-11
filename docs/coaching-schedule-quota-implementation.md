# 一对一陪练排课与时长配额 — 实现说明

本文档描述在「**一师一课一学员**」模式下，**排课 / 上课**与**陪练剩余时长、老师计量上限**的产品规则与后端/前端实现要点，供评审与迭代开发使用。

---

## 1. 业务目标与范围

| 目标 | 说明 |
|------|------|
| 排课 | 像课程表一样安排「某老师 + 某学员」在固定时段上课；支持周视图、状态流转。 |
| 上课 | **从老师点击「开始上课」起至「下课」止**记录实际时长；按 §4 规则折算为计费分钟，扣学员剩余、计老师用量。 |
| 1:1 | 默认一节排课只绑定 **一名学员**；不实现「一节大班课多个学员」的主流程（若未来需要可再扩展子表）。 |
| 计费基础 | 学员维度 **陪练剩余时长（分钟）**；老师维度 **周期内已上分钟数（或剩余可上额度）**，为后续计费/对账预留。 |

**不在本文档首期强制范围的内容**（可后续单独立项）：支付下单、发票、多币种、请假审批流、自动调课算法。

---

## 2. 核心概念与数据模型

### 2.1 学员 × 老师：陪练剩余时长

表示「该学员在该老师名下还可消耗的陪练分钟数」（业务上可来自购买套餐划拨，首期可后台手工调整）。

建议表：`student_teacher_coaching_quota`（名称可缩短）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uint | 主键 |
| teacher_id | uint | 老师（用户 ID，role=teacher） |
| student_id | uint | 学员 |
| remaining_minutes | int | **剩余可上分钟数**，≥0 |
| total_allocated_minutes | int | 可选：历史累计分配（便于对账） |
| version | int | 乐观锁，扣减时 CAS |
| created_at / updated_at | time | |

**约束**：`(teacher_id, student_id)` 唯一。

**规则**：

- 新建师生关系时可 `remaining_minutes=0`，由运营在后台充值分钟。
- 每次**有效完课**按约定规则扣减 `remaining_minutes`（见 §4）。
- 扣减不允许为负；并发下用「读 version → 更新 where version」或单条 `UPDATE ... WHERE remaining_minutes >= ?`。

### 2.2 老师：周期计量（计费/上限）

「老师目前已经上了多少分钟」用于计量费用，通常按 **自然月或账单周期** 汇总；也可增加「本月封顶分钟」配置。

建议表：`teacher_coaching_usage_period`（或拆成配置表 + 聚合）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uint | 主键 |
| teacher_id | uint | |
| period_start | date | 周期起始日（如每月 1 号） |
| period_end | date | 周期结束日（开区间或闭区间约定一致即可） |
| used_minutes | int | **本周期已确认计入的上课分钟数** |
| cap_minutes | int | 可选：本周期允许上的上限（0 表示不限制） |

**约束**：`(teacher_id, period_start)` 唯一。

**规则**：

- 完课时将「计入费用的分钟数」累加到当前周期 `used_minutes`。
- 若配置 `cap_minutes` 且 `used_minutes + delta > cap_minutes`，需定义产品行为：禁止排新课、仅警告、或允许但标记超额（首期建议：**禁止创建会超额的新排课**，或 **允许排课但完课时截断计费分钟** —— 需产品拍板）。

### 2.3 排课（课表项）

一对一：一条排课 = 一个老师 + 一个学员 + 一个时间段。

建议表：`coaching_appointments`（或 `coaching_schedules`）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uint | |
| teacher_id | uint | |
| student_id | uint | 唯一学员 |
| scheduled_date | date | 上课日 |
| start_time | string | `HH:MM`，与时区策略一致（建议全存 UTC + 展示用用户时区，或统一服务器时区并在文档写明） |
| end_time | string | `HH:MM`，`end > start` 或跨日规则明确 |
| duration_minutes | int | 冗余：便于校验与展示，可由起止时间算出 |
| status | string | 见 §3 |
| title | string | 可选，默认可由「学员名 + 陪练」生成 |
| notes | text | 可选 |
| is_deleted | bool | 软删 |

**索引**：`(teacher_id, scheduled_date)`、`(student_id, scheduled_date)`，便于周视图查询。

### 2.4 实际上课记录（可选但推荐）

与排课分离，便于支持「迟到、早退、拖堂」与多次尝试。

建议表：`coaching_session_records`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uint | |
| appointment_id | uint | 关联排课 |
| teacher_id / student_id | uint | 冗余，方便查询 |
| started_at | time | **老师点击「开始上课」时写入**，作为实际计量的起点 |
| ended_at | time | **老师点击「下课」时写入** |
| actual_minutes | int | 可选冗余：由 `ended_at - started_at` 换算的整分钟数（便于对账展示） |
| billed_minutes | int | **本次生效的计费分钟**：`min(actual_minutes, 下课瞬间学员剩余额度)`，见 §4 |
| status | string | e.g. `completed` / `void` |

首期可简化为：**只有一条 session 与 appointment 1:1**，在 appointment 上直接存 `actual_start` / `actual_end`，待规则复杂后再拆表。

---

## 3. 排课状态机

建议状态枚举：

| 状态 | 含义 |
|------|------|
| `scheduled` | 已排未开始 |
| `in_progress` | 已开始未结束 |
| `completed` | 已正常完课 |
| `cancelled` | 取消（不扣学员时长、不计入老师用量，除非产品要求违约金分钟） |
| `no_show` | 缺席（是否扣时长产品定，建议首期不计入 billed_minutes） |

**允许迁移**（示例）：

- `scheduled` → `in_progress`（老师/学员端「开始上课」）
- `in_progress` → `completed`（「下课」）
- `scheduled` → `cancelled`
- `in_progress` → `completed`（强制结束）

**幂等**：重复「下课」应返回成功且不重复扣减。

---

## 4. 时长扣减与计量规则（已定稿）

### 4.1 实际时长 `actual_minutes`

- **起点**：老师端点击 **「开始上课」** 的时刻 → 写入 `started_at`（或等价字段），并开始计时。  
- **终点**：老师端点击 **「下课」** 的时刻 → 写入 `ended_at`。  
- **换算**：`actual_minutes = 将 (ended_at - started_at) 换算为整分钟数`。  
  - 建议：**向下取整（floor）** 到整分钟，避免秒级争议；若产品要「满 1 秒算 1 分钟」需单独写明。  
- **未点下课**：不允许进入 `completed`；若超时强制结束，仍以写入的 `ended_at` 为准。

### 4.2 学员扣减 `billed_minutes` 与老师计量 `teacher_credited_minutes`

在 **下课瞬间** 读取该学员在该老师名下的 `remaining_minutes`（记为 `R`），则 **学员扣减**：

```text
billed_minutes = min(actual_minutes, R)
```

**学员**：`remaining_minutes -= billed_minutes`。

**老师周期**（自然月一行，可选 `cap_minutes`，`0` 表示不封顶）：在锁行读取 `used_minutes` 后，

```text
room = max(0, cap_minutes - used_minutes)   // cap_minutes=0 时视为 +∞，teacher_credited = billed_minutes
teacher_credited_minutes = min(billed_minutes, room)
used_minutes += teacher_credited_minutes
```

完课记录同时存 `actual_minutes`、`billed_minutes`、`teacher_credited_minutes`。

**示例（仅学员限额）**：实际 30 分钟，`R=20` → `billed_minutes=20`；若未封顶 → `teacher_credited_minutes=20`。

**示例（封顶截断）**：`billed_minutes=20`，`cap=100`、`used=95` → `room=5` → `teacher_credited_minutes=5`，学员仍扣 20。

若 `R = 0`：**禁止开始上课**（`POST .../start` 返回 400，文案如「陪练剩余时长不足，无法开始」）；学员需先由后台/运营增加额度。下课时若仍为 `in_progress` 且 `R>0`，仍按 §4.2 计算 `billed_minutes`。

若老师**当前自然月**已存在 `teacher_coaching_usage_period` 行，且 `cap_minutes > 0` 且 `used_minutes >= cap_minutes`：**同样禁止开始上课**（返回 400，文案如「本月老师计费额度已满，无法开始上课」）。未创建该月周期行或 `cap_minutes = 0` 视为不限制。此检查**不会在开始上课时自动创建**周期行（与下课时 `GetOrCreate` 不同），避免误生成空行影响语义。

### 4.3 事务与顺序

1. 校验 appointment 状态：`in_progress` → 仅允许一次有效 `end`（幂等）。  
2. 事务内：锁定 quota → 算 `billed_minutes` → 扣学员；锁定 `teacher_coaching_usage_period` 当前月 → 算 `teacher_credited_minutes` → `used_minutes += teacher_credited_minutes`；写入 `coaching_session_records`。  
3. 学员 quota 并发用乐观锁 `version`；周期表用行锁。

### 4.4 取消与缺席

- **未开始** 取消：`cancelled`，不产生 `actual_minutes` / `billed_minutes`。  
- **已开始** 后取消/异常结束：仍可按 **已发生的 started_at～ended_at** 计算 `actual_minutes` 并套 §4.2（需产品是否区分「正常下课」与「中途取消」）。  
- **`no_show`**：建议 `billed_minutes = 0`（首期）。

---

## 5. API 设计（建议）

前缀与现有项目一致，如 `/api`。鉴权：`AuthRequired`；管理端：`admin`；老师端：`teacher`；学员端：`student`。

### 5.1 管理端 / 运营（已实现前缀 `/api/coaching`，需 admin）

- `GET/POST/PUT/DELETE /coaching/appointments` — 排课 CRUD（`GET` 需 `from`、`to`：`YYYY-MM-DD`）。
- `GET/PUT /coaching/quotas` — 列表与设置师生 `remaining_minutes`。
- `GET /coaching/usage-periods?teacherId=&limit=` — 某老师历史周期用量。
- `PUT /coaching/usage-periods` — body：`teacherId`、`month`（`YYYY-MM`）、`capMinutes`、`usedMinutes`（创建或更新该月一行）。
- `GET /coaching/audit-logs?page=&pageSize=&action=&appointmentId=` — 陪练模块结构化操作审计（分页；`action` 可选过滤）。

### 5.2 老师端

- `GET /teacher/coaching/week?date=YYYY-MM-DD` — 本周排课列表（与旧 `teacher/week` 类似，数据结构对齐前端课表）。
- `POST /teacher/coaching/appointments/:id/start`
- `POST /teacher/coaching/appointments/:id/end` — 触发完课流水：写 session、扣 quota、加 usage。

### 5.3 学员端

- `GET /student/coaching/week?date=...` — 我的课表。
- 可选：`GET /student/coaching/quota` — 我对各老师的剩余分钟（或只对绑定老师展示）。

### 5.4 公共查询

- `GET /coaching/teachers/:id/students` — 老师名下学员列表（带 remaining_minutes），用于排课下拉（权限：老师看自己，admin 看全部）。

---

## 6. 前端实现要点

### 6.1 管理后台

- **排课管理页**：周历 / 日历 + 新建弹窗（选老师、学员、日期、起止时间）；冲突检测（老师同一时段重叠、学员同一时段重叠）。
- **时长管理**：师生对列表 + 剩余分钟编辑；老师周期用量只读或受限编辑。

### 6.2 客户端（老师 / 学员）

- **首页 / 课表**：数据源为新 API；支持 **上一周 / 本周 / 下一周** 切换，请求参数 `date` 为该周内任意一天的 `YYYY-MM-DD`。
- **上课按钮**：开始/下课与状态展示；与 `material-selection` 等训练入口的衔接方式与现产品一致即可（可「下课后进入训练」或独立）。

### 6.3 管理后台 · 操作审计

- 表 `coaching_audit_logs`：记录排课 CRUD、额度调整、老师计量周期保存、老师开始/下课等（含 `action`、`summary`、`detail` JSON、操作者、IP）。
- 后台「一对一陪练」页提供 **操作审计** 分页列表，与 `GET /coaching/audit-logs` 对齐。
- 常见 `action`：`appointment_create` / `appointment_update` / `appointment_delete`、`quota_upsert`、`usage_period_put`、`session_start`、`session_end`。

---

## 7. 数据库与迁移

1. 新增表：`student_teacher_coaching_quota`、`teacher_coaching_usage_period`、`coaching_appointments`、`coaching_session_records`、`coaching_audit_logs`。
2. GORM `AutoMigrate` 注册新模型。
3. **旧表**（若仍存在）：与本期模型无关，可保留或另脚本 `DROP`（运维决策）。

---

## 8. 并发、一致性与审计

- 扣减配额、增加老师用量必须在 **同一事务**。
- 关键操作写 **操作日志**（谁、何时、改动了哪对师生多少分钟、哪次 appointment）。
- 乐观锁或 `SELECT FOR UPDATE` 二选一，避免双下课双扣。

---

## 9. 测试清单（验收）

- [ ] 同一老师同一时间段不能排两节冲突课（可选：允许重叠若产品要「缓冲」）。
- [ ] 同一学员同一时间段不能排两节冲突课。
- [ ] 完课扣减后 `remaining_minutes` 正确；**实际时长大于剩余时** `billed_minutes = min(actual, R)`，老师 `used_minutes` 与学员扣减一致。
- [ ] 老师周期 `used_minutes` 随完课增加；跨周期自动建新 period 行。
- [ ] 取消未开始课程不扣分钟。
- [ ] 重复 end 幂等。

---

## 10. 待产品拍板项（其余）

1. 时区：全员东八区 vs 用户级时区。  
2. 老师 `cap_minutes` 超额时的策略（与 `billed_minutes` 叠加时是否二次截断）。  
3. 缺席、迟到是否计费（首期建议见 §4.4）。  
4. `actual_minutes` 取整：floor 与「满 1 秒进 1 分钟」二选一（当前默认 **floor 整分钟**）。  
5. ~~学员剩余为 0 时是否允许开始~~（已定：**禁止开始**）。

---

## 11. 与已删除旧实现的差异

| 维度 | 旧实现（已移除） | 本期 |
|------|------------------|------|
| 课程/班级 | Course、Class、ClassCourse 多对多 | 不强制「课程」实体；可直接老师+学员+时间（可选后续加「课程类型」标签）。 |
| 一节多学员 | Schedule + 多学员 | **一节仅一学员**。 |
| 计量 | 偏课消记录 | 显式 **remaining_minutes** + **周期 used_minutes/cap**。 |

---

*文档版本：1.4 · 老师封顶已满禁止开始；App 周视图切换；陪练专用审计表与后台查询。*
