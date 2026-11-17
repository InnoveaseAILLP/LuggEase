import 'react-native-gesture-handler';
import React from 'react';
import {ActivityIndicator, StatusBar, View} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {KeyboardProvider} from 'react-native-keyboard-controller';
import {QueryClientProvider} from '@tanstack/react-query';
import {AuthProvider, useAuth} from './src/auth';
import {BookingProvider} from './src/booking';
import {ToastProvider, Icon} from './src/components/ui';
import {ErrorBoundary} from './src/components/error-boundary';
import {queryClient} from './src/query-client';
import {useTheme} from './src/theme';
import Login from './app/login';
import AdminAccountRequired from './app/admin-account-required';
import {isAdminLoginEntry} from './src/login-entry';
import Onboarding from './app/onboarding';
import PartnerRegister from './app/partner-register';
import Deployment from './app/deployment';
import AdminReports from './app/admin-reports';
import Home from './app/(tabs)/index';
import Orders from './app/(tabs)/orders';
import Profile from './app/(tabs)/profile';
import Book from './app/book/index';
import Items from './app/book/items';
import Review from './app/book/review';
import Order from './app/order/[id]';
const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();
function Main() {
  const {colors} = useTheme();
  return <Tabs.Navigator screenOptions={{headerShown: false, tabBarActiveTintColor: colors.brandPrimary}}>
    <Tabs.Screen name="Home" component={Home} options={{tabBarButtonTestID:'tab-home', tabBarIcon: ({color, size}) => <Icon name="home-variant" color={color} size={size}/>}}/>
    <Tabs.Screen name="Orders" component={Orders} options={{tabBarButtonTestID:'tab-orders', tabBarIcon: ({color, size}) => <Icon name="package-variant-closed" color={color} size={size}/>}}/>
    <Tabs.Screen name="Profile" component={Profile} options={{tabBarButtonTestID:'tab-profile', tabBarIcon: ({color, size}) => <Icon name="account-circle" color={color} size={size}/>}}/>
  </Tabs.Navigator>;
}
function Navigation() {
  const {user, loading} = useAuth();
  if (loading) return <View style={{flex:1,justifyContent:'center'}}><ActivityIndicator testID="app-loading"/></View>;
  const gate = !user ? 'guest' : isAdminLoginEntry() && user.role!=='admin' ? 'admin-account' : !user.role ? 'onboarding' : user.role === 'partner' && (!user.partner_profile || user.partner_status === 'incomplete') ? 'partner' : 'ready';
  return <NavigationContainer><Stack.Navigator key={`${user?.user_id || 'guest'}:${gate}`} screenOptions={{headerShown:false}}>
    {gate === 'guest' ? <Stack.Screen name="Login" component={Login}/> : gate === 'admin-account' ? <Stack.Screen name="AdminAccountRequired" component={AdminAccountRequired}/> : gate === 'onboarding' ? <Stack.Screen name="Onboarding" component={Onboarding}/> : gate === 'partner' ? <Stack.Screen name="PartnerRegister" component={PartnerRegister}/> : <>
      <Stack.Screen name="Main" component={Main}/>
      {user?.role==='admin'&&<Stack.Screen name="AdminReports" component={AdminReports}/>}
      <Stack.Screen name="PartnerRegister" component={PartnerRegister}/>
      {user?.role === 'customer' && <><Stack.Screen name="Book" component={Book}/><Stack.Screen name="Items" component={Items}/><Stack.Screen name="Review" component={Review}/></>}
      <Stack.Screen name="Order" component={Order}/>
    </>}
    <Stack.Screen name="Deployment" component={Deployment}/>
  </Stack.Navigator></NavigationContainer>;
}
export default function App() {
  return <GestureHandlerRootView style={{flex:1}}><SafeAreaProvider><ErrorBoundary><QueryClientProvider client={queryClient}><KeyboardProvider><AuthProvider><BookingProvider><ToastProvider><StatusBar barStyle="dark-content"/><Navigation/></ToastProvider></BookingProvider></AuthProvider></KeyboardProvider></QueryClientProvider></ErrorBoundary></SafeAreaProvider></GestureHandlerRootView>;
}
