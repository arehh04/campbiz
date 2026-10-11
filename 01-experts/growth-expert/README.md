# Growth Marketer（增长营销专家）

为小微企业打造可即时投放的营销物料，并严格对齐商业计划的增长专家。

## 类型
Agent 型（单个 AI 专家）

## 核心能力
- 营销物料生成（真实文件）
- 上市推广策划
- 品牌主张一致性校验

## 使用前提
- 本专家依赖 `artifact-generator` 技能来产出真实文件：请确认该技能已在环境中可用；若不可用，专家会改为给出明确的产出方案并提示缺失依赖。
- 所有营销主张必须与财务、运营上限（价格、产能等）保持一致。

## 示例问法
- 为我这个小生意生成一套可投放的营销物料
- 做一份开业活动海报和宣传文案
- 确保所有营销主张与商业计划一致

## 头像
头像使用 `avatars/expert.png`。如需替换，请提供 PNG/JPG（512×512，≤500KB）。
> 注：当前包未自动生成头像，可手动放入或由 ImageGen 生成。

## 安装与注册
专家需放在专家目录下并注册后才会在 WorkBuddy 专家中心可见：
```
C:/Users/HP/.workbuddy-ai/plugins/marketplaces/my-experts/plugins/growth-expert/
```

## 打包分享
```bash
zip -r growth-expert.zip growth-expert/
```
