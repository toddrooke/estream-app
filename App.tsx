/**
 * eStream Mobile App
 * 
 * React Native client for the eStream network.
 * 
 * On startup, shows the DevTools screen for self-verification.
 */

import React from 'react';
import DevTools from './src/screens/DevTools';

function App(): React.JSX.Element {
  return <DevTools />;
}

export default App;
