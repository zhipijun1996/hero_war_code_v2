import { createActionHandlers } from './server/handlers/actionHandlers.ts';
import { createCombatHandlers } from './server/handlers/combatHandlers.ts';
import { createShopHandlers } from './server/handlers/shopHandlers.ts';
import { createSeatHandlers } from './server/handlers/seatHandlers.ts';
import { createTableHandlers } from './server/handlers/tableHandlers.ts';

export const createHandlers = (deps: any) => {
  const actionHandlers = createActionHandlers(deps);
  const combatHandlers = createCombatHandlers(deps);
  const shopHandlers = createShopHandlers(deps);
  const seatHandlers = createSeatHandlers(deps);
  const tableHandlers = createTableHandlers(deps);

  return {
    ...actionHandlers,
    ...combatHandlers,
    ...shopHandlers,
    ...seatHandlers,
    ...tableHandlers,
  };
};
