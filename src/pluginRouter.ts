import {PluginManager} from 'sn-plugin-lib';

export const BUTTON_ID_TOOLBAR = 100;
export const BUTTON_ID_LASSO_TEXT = 200;
export const BUTTON_ID_SELECTED_TEXT = 201;

export type ButtonEvent = {
  pressEvent: number;
  id: number;
  name: string;
  icon: string;
};

export type ButtonSubscriber = (event: ButtonEvent) => void;

let lastEvent: ButtonEvent | null = null;
const subscribers = new Set<ButtonSubscriber>();
let installed = false;

export function installPluginRouter(): void {
  if (installed) {
    return;
  }
  installed = true;
  PluginManager.registerButtonListener({
    onButtonPress(event: ButtonEvent) {
      lastEvent = event;
      for (const fn of subscribers) {
        try {
          fn(event);
        } catch (e) {
          console.error('[PLUGIN_ROUTER] subscriber threw', e);
        }
      }
    },
  });
}

export function getLastButtonEvent(): ButtonEvent | null {
  return lastEvent;
}

export function consumeLastButtonEvent(): ButtonEvent | null {
  const val = lastEvent;
  lastEvent = null;
  return val;
}

export function subscribeToButtonEvents(fn: ButtonSubscriber): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
