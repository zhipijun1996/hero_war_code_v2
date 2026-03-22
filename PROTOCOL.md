# 游戏协议与开发规范 (Game Protocol & Development Standards)

为了保证项目的一致性和可维护性，所有模块必须遵守以下协议规范。

## 1. 目标 ID 统一规范 (Target ID Standards)

在进行动作选择、攻击、移动等操作时，目标 ID 的命名必须遵循以下规则：

- **城堡目标 (Castle Targets)**: 统一格式为 `castle_{q}_{r}`
  - 示例: `castle_0_4`
- **怪物目标 (Monster Targets)**: 统一格式为 `monster_{q}_{r}`
  - 示例: `monster_-2_4`
- **英雄目标 (Hero Targets)**: 统一使用 `boundToCardId` (即英雄卡牌的 ID)
  - 示例: `hero_abc123`
- **地块目标 (Hex Targets)**: 统一格式为 `hex_{q}_{r}`
  - 示例: `hex_1_-1`

## 2. 流程控制规范 (Flow Control Standards)

- **行动结束 (Finish Action)**: 统一优先调用 `finish_action` 接口。
  - 逻辑层应通过 `ActionEngine.finishAction` 或向 socket 发送 `finish_action` 事件来结束当前玩家的动作。
- **阶段切换 (Phase Transition)**: 统一使用 `PhaseManager.initPhase` 进行阶段初始化。

## 3. 玩家对象访问规范 (Player Access Standards)

访问玩家数据的统一路径：
`playerIndex` -> `gameState.seats[playerIndex]` (获取 `playerId`) -> `gameState.players[playerId]`

- **禁止** 直接通过 `socket.id` 在逻辑深处查找玩家，应在入口处转换为 `playerIndex`。
- **禁止** 假设 `seats` 数组中一定有值，必须进行 `null` 检查。

## 4. 坐标系统 (Coordinate System)

- 统一使用 **立方坐标 (Cube Coordinates)** 的 `q, r` 表示法。
- 转换工具函数统一使用 `src/shared/utils/hexUtils.ts` 中的 `pixelToHex` 和 `hexToPixel`。

## 5. 状态变更 (State Mutation)

- 所有状态变更必须在服务端完成。
- 变更后必须调用 `broadcastState()` 同步给所有客户端。
- 关键逻辑（如战斗、移动、卡牌效果）应从 `server.ts` 抽离到 `src/logic/` 下的对应模块。

## 6. 日志与通知 (Logs & Notifications)

- **日志**: 使用 `helpers.addLog(message, playerIndex)`。
- **通知**: 直接修改 `gameState.notification` 用于 UI 顶部的临时提示。
