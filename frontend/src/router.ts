import {useMemo} from 'react';
import {StackActions, useNavigation, useRoute} from '@react-navigation/native';

const routes: Record<string, string> = {
  '/(tabs)': 'Main', '/login': 'Login', '/onboarding': 'Onboarding',
  '/partner-register': 'PartnerRegister', '/deployment': 'Deployment',
  '/book': 'Book', '/book/items': 'Items', '/book/review': 'Review',
};
function resolve(path: string): {name: string; params?: {id: string}} {
  if (path.startsWith('/order/')) return {name: 'Order', params: {id: path.slice(7)}};
  const name = routes[path];
  if (!name) throw new Error(`Unknown route: ${path}`);
  return {name};
}
export function useRouter() {
  const navigation = useNavigation<any>();
  return useMemo(() => ({
    push(path: string) { const r = resolve(path); navigation.dispatch(StackActions.push(r.name, r.params)); },
    replace(path: string) { const r = resolve(path); navigation.dispatch(StackActions.replace(r.name, r.params)); },
    back() { if (navigation.canGoBack()) navigation.goBack(); },
    canGoBack() { return navigation.canGoBack(); },
    dismissAll() { navigation.dispatch(StackActions.popToTop()); },
  }), [navigation]);
}
export function useLocalSearchParams<T>() { return (useRoute().params ?? {}) as T; }
