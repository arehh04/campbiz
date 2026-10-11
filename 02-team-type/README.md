# CampusBiz Orchestrator

校园小微创业策略团：主理人拆解目标，调度财务、需求、增长、运营四位专家并行测算，交叉校验可行性与风险，输出一份可直接落地的统一执行方案。

## 类型

Team 型（多角色协作团队）

## 团队成员

| 成员 ID | 名字 | 职业 | 职责 |
|---------|------|------|------|
| `campusbiz-orchestrator-team-lead` | 正合吾 | 创业统筹官 | 拆解目标、并行调度、交叉校验、裁决、汇编统一方案 |
| `finance-expert` | 算得清 | 财务专家 | 单位经济、盈亏平衡、反推所需日销量、可行性判定 |
| `demand-expert` | 丘知本 | 需求分析师 | 日需求估算、不确定性区间、关键假设梳理 |
| `growth-expert` | 张声艺 | 增长营销专家 | 生成落地页/营销日历/运营清单等真实物料 |
| `operations-expert` | 运转安 | 运营计划专家 | 产能内的备货量、接单截止、履约窗口、每日任务 |

## 功能

1. **目标拆解**：把一个模糊的创业目标拆成财务、需求、增长、运营四条工作流。
2. **并行执行**：Phase 1 三路并行调度（财务 / 需求 / 运营），互不阻塞。
3. **可行性交叉校验**（核心能力）：
   - `required_daily_sales > daily_capacity` → **NOT_FEASIBLE**，直接否决并给出产能缺口。
   - `required_daily_sales > estimated_daily_demand` → **AT_RISK**，给出提需求 / 降成本 / 调价格 / 降目标四类量化修正建议。
   - 两者均满足 → **FEASIBLE**。
4. **统一方案汇编**：输出带结论徽章、关键数字表、修正清单与风险说明的《CampusBiz 统一经营执行方案》。

## 使用示例

- 我有一个校园小生意的想法，帮我拆解成财务、需求、增长、运营方案并校验可行性
- 跑一遍曲奇饼干场景：我在校内卖曲奇，5元一块，想月入6000元，每天最多做40块
- 交叉检查我的收入目标在产能和预估日需求下是否现实

## 头像

头像已自动生成在 `avatars/` 目录下。如需替换为自定义头像，要求：
- 格式：PNG（推荐）或 JPG
- 尺寸：512×512 px
- 大小：单张不超过 500KB

## 安装

将专家包目录放到专家目录下：

```
C:\Users\HP\.workbuddy-ai\plugins\marketplaces\my-experts\plugins\campusbiz-orchestrator\
```

然后运行注册命令使其可见：

```bash
python3 scripts/register_expert.py <expert-dir>
```

## 打包分享

```bash
zip -r campusbiz-orchestrator.zip campusbiz-orchestrator/
```
