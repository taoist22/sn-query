import {AppRegistry, Image} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {PluginManager} from 'sn-plugin-lib';
import {
  BUTTON_ID_LASSO_TEXT,
  BUTTON_ID_SELECTED_TEXT,
  BUTTON_ID_TOOLBAR,
  installPluginRouter,
} from './src/pluginRouter';

const BUTTON_TYPE_SIDEBAR = 1;
const BUTTON_TYPE_LASSO = 2;
const BUTTON_TYPE_TEXT_SELECTION = 3;
const SHOW_TYPE_WITH_UI = 1;

AppRegistry.registerComponent(appName, () => App);

PluginManager.init();
installPluginRouter();

// NOTE-context only — SN Views builds dashboards from Supernote note metadata.
PluginManager.registerButton(BUTTON_TYPE_SIDEBAR, ['NOTE'], {
  id: BUTTON_ID_TOOLBAR,
  name: 'SN Query',
  icon: Image.resolveAssetSource(require('./assets/query.png')).uri,
  showType: SHOW_TYPE_WITH_UI,
});

PluginManager.registerButton(BUTTON_TYPE_LASSO, ['NOTE'], {
  id: BUTTON_ID_LASSO_TEXT,
  name: 'SN Query',
  icon: Image.resolveAssetSource(require('./assets/query.png')).uri,
  showType: SHOW_TYPE_WITH_UI,
  editDataTypes: [3],
});

PluginManager.registerButton(BUTTON_TYPE_TEXT_SELECTION, ['NOTE', 'DOC'], {
  id: BUTTON_ID_SELECTED_TEXT,
  name: 'SN Query',
  icon: Image.resolveAssetSource(require('./assets/query.png')).uri,
  showType: SHOW_TYPE_WITH_UI,
});
