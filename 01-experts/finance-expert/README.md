# Finance Specialist（财务专家）

为小微企业提供单位经济与盈利可行性测算的财务专家，所有算术交由 `finance-calculator` 技能完成。

## 类型
Agent 型（单个 AI 专家）

## 核心能力
- 单位经济测算（单位贡献）
- 盈亏平衡分析（月/日销量）
- 盈利可行性评估（FEASIBLE / AT_RISK / NOT_FEASIBLE）

## 使用前提
- 本专家已配置在启动时预加载内置 `finance-calculator` 技能；所有算术必须由该技能完成，专家本身不手算。
- 输出为标准 JSON，字段：unit_contribution、required_monthly_sales、required_daily_sales、monthly_revenue、monthly_profit、feasibility_status、reason。

## 示例问法
- 帮我测算这个小生意的单位经济与盈亏平衡点
- 评估我设定的月营收目标是否可行
- 用结构化 JSON 给出财务可行性结论

## 头像
头像使用 `avatars/expert.png`。如需替换，请提供 PNG/JPG（512×512，≤500KB）。
> 注：当前包未自动生成头像，可手动放入或由 ImageGen 生成。

## 安装与注册
专家需放在专家目录下并注册后才会在 WorkBuddy 专家中心可见：
```
C:/Users/HP/.workbuddy-ai/plugins/marketplaces/my-experts/plugins/finance-expert/
```

## 打包分享
```bash
zip -r finance-expert.zip finance-expert/
```
