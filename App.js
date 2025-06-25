import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import { EventProvider } from './src/EventContext';

export default function App() {
  return (
    <EventProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </EventProvider>
  );
}
