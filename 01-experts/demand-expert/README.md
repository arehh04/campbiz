# Demand Analyst（需求分析师）

为小微企业分析市场真实需求、测算每日需求量与不确定性的需求专家。

## 类型
Agent 型（单个 AI 专家）

## 核心能力
- 需求测算（基于销售历史）
- 不确定性评估（波动区间与风险）
- 假设梳理（关键假设清单）

## 使用前提
- 本专家依赖 `Sales History Analyzer` 技能：请确认该技能已在环境中可用；若不可用，专家会基于假设进行模拟并在输出中标注 `SIMULATED`。
- 输出为标准 JSON，字段：estimated_daily_demand、demand_uncertainty、key_assumptions。

## 示例问法
- 帮我估算这个新项目每天的潜在市场需求量
- 分析我的潜在客户在哪里、需求有多稳定
- 用 JSON 给出需求估算与关键假设

## 头像
头像使用 `avatars/expert.png`。如需替换，请提供 PNG/JPG（512×512，≤500KB）。
> 注：当前包未自动生成头像，可手动放入或由 ImageGen 生成。

## 安装与注册
专家需放在专家目录下并注册后才会在 WorkBuddy 专家中心可见：
```
C:/Users/HP/.workbuddy-ai/plugins/marketplaces/my-experts/plugins/demand-expert/
```

## 打包分享
```bash
zip -r demand-expert.zip demand-expert/
```
