import React from 'react';
import SNViewsPanel from './src/SNViewsPanel';
import {installPluginRouter} from './src/pluginRouter';

installPluginRouter();

export default function App(): React.JSX.Element {
  return <SNViewsPanel />;
}
