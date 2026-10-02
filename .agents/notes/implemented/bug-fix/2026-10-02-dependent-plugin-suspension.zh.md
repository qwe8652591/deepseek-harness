# Agent Note: 停用提供者后报告依赖组件暂停

Status: implemented

[English](2026-10-02-dependent-plugin-suspension.md) | 中文

## Problem

停用服务提供者会通过 Cordis 注入停止依赖它的插件，但 profile 重载把这些新进入等待状态的条目作为激活失败。Plugin Manager 对已成功保存的停用操作返回 `application: failed`，并且没有发出成功重载通知。

## Decision

重载前记录活动条目。某个活动条目被停用或移除后，原先活动、配置未变且 fiber 相同的条目可以进入等待状态，而不使重载失败。缺失服务的诊断仍通过警告返回。显式启用目标必须激活；新增条目、配置变化、fiber 失败和释放错误仍使操作失败。

## Alternatives considered

把依赖条目持久化为停用会覆盖用户选择，并阻止自动恢复。忽略所有等待条目会掩盖新安装的配置错误。此次例外依据实际生命周期变化，其他条目继续使用既有激活策略。

## Consequences

服务恢复后，Cordis 自动恢复依赖条目，无需修改它们的 profile 选择。Loader 组合测试覆盖插件和组合包启停、显式启用暂停条目，以及无关的新增等待条目。工作台发行包通过真实 DSH profile 和 Plugin Manager 验证打包后的组件。
