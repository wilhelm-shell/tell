import { render as renderConversations } from './screens/conversations.js';
import { render as renderConversation } from './screens/conversation.js';
import { render as renderNewMessage } from './screens/newMessage.js';
import { render as renderImage } from './screens/image.js';
import { render as renderVideo } from './screens/video.js';
import { render as renderSettings } from './screens/settings.js';
import { getBridgeConfig } from './config.js';
import { loadTheme, applyTheme } from './lib/theme.js';

const screens = {
  conversations: renderConversations,
  conversation: renderConversation,
  newMessage: renderNewMessage,
  image: renderImage,
  video: renderVideo,
  settings: renderSettings,
};
const root = document.getElementById('app');
let current = null;

// Screens get `params` (e.g. which conversation to open) and `navigate`
// back. Exactly one screen is mounted at a time; it must detach its own
// listeners so key handlers never stack.
function navigate(name, params) {
  if (current) {
    try { current.detach(); } catch (_) {}
    current = null;
  }
  const fn = screens[name];
  if (!fn) return;
  current = fn(root, { navigate: navigate, params: params || {} });
}

applyTheme(loadTheme());
navigate(getBridgeConfig() ? 'conversations' : 'settings');
