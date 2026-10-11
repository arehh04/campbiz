# Operations Planner（运营计划专家）

为小微企业制定每日运营计划、严守产能上限的运营专家。

## 类型
Agent 型（单个 AI 专家）

## 核心能力
- 每日运营计划
- 产能管控
- 履约排程

## 使用前提
- 本专家不依赖额外技能，纯规划逻辑；但必须在用户提供 stated capacity（产能上限）的前提下工作。
- 输出为标准 JSON，字段：prep_quantity、order_cutoff_time、fulfillment_window、daily_tasks。
- prep_quantity 绝不会超过产能上限。

## 示例问法
- 根据我的产能帮我制定今天的运营计划
- 告诉我每天该备多少货、几点截单
- 用 JSON 输出每日任务与履约窗口

## 头像
头像使用 `avatars/expert.png`。如需替换，请提供 PNG/JPG（512×512，≤500KB）。
> 注：当前包未自动生成头像，可手动放入或由 ImageGen 生成。

## 安装与注册
专家需放在专家目录下并注册后才会在 WorkBuddy 专家中心可见：
```
C:/Users/HP/.workbuddy-ai/plugins/marketplaces/my-experts/plugins/operations-expert/
```

## 打包分享
```bash
zip -r operations-expert.zip operations-expert/
```
