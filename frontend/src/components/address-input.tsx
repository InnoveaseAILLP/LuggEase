import {getErrorMessage} from '@/src/errors';
import {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, Text, View} from 'react-native';
import {api} from '@/src/api';
import {Input, space} from '@/src/components/ui';
import {useTheme} from '@/src/theme';

type Suggestion = {place_id: string; title: string; subtitle: string};
// A session is billing correlation only, never an authentication credential.
const newSession = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.floor(Math.random() * 16); return (c === 'x' ? r : (r & 3) | 8).toString(16);
});
export function AddressInput({value, onChangeText, onSelect, testID}: {
  value: string; onChangeText: (text: string) => void;
  onSelect: (place: {address: string; state: string; city?: string}) => void; testID: string;
}) {
  const {colors} = useTheme();
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const session = useRef(newSession());
  const revision = useRef(0);
  const selected = useRef(value);
  useEffect(() => {
    const version = ++revision.current;
    setSuggestions([]); setError(''); setBusy(false);
    if (!focused || value.trim().length < 3 || value === selected.current) return;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const result = await api<{suggestions: Suggestion[]}>(`/places/autocomplete?input=${encodeURIComponent(value.trim().slice(0, 200))}&session_token=${session.current}`);
        if (revision.current === version) {
          setSuggestions(result.suggestions);
          if (!result.suggestions.length) setError('No matching places. Try an area or city, or enter the address manually.');
        }
      } catch (e: any) { if (revision.current === version) setError(getErrorMessage(e)); }
      finally { if (revision.current === version) setBusy(false); }
    }, 350);
    return () => { clearTimeout(timer); ++revision.current; };
  }, [value, focused]);
  const choose = async (item: Suggestion) => {
    const version = ++revision.current;
    setBusy(true); setError(''); setSuggestions([]);
    try {
      const place = await api<{address: string; state: string; city?: string}>(`/places/details/${encodeURIComponent(item.place_id)}?session_token=${session.current}`);
      if (revision.current !== version) return;
      selected.current = place.address;
      session.current = newSession();
      onSelect(place);
      setFocused(false);
    } catch (e: any) { if (revision.current === version) setError(getErrorMessage(e)); }
    finally { if (revision.current === version) setBusy(false); }
  };
  return <View style={{gap: space.sm}}>
    <Input testID={testID} value={value} onChangeText={t => { ++revision.current; onChangeText(t); }}
      onFocus={() => setFocused(true)} onBlur={() => { /* Selection presses must survive keyboard blur. */ }}
      placeholder="Search area, street, city or pincode" multiline autoCorrect={false} maxLength={500}/>
    {busy ? <ActivityIndicator accessibilityLabel="Searching Google Maps" color={colors.brandPrimary}/> : null}
    {suggestions.length ? <View testID={`${testID}-suggestions`} style={{borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, padding: space.sm, backgroundColor: colors.surfaceSecondary}}>
      <Text style={{fontSize: 12, fontWeight: '400', color: colors.muted, alignSelf: 'flex-end', margin: 5}}>Google Maps</Text>
      {suggestions.map(item => <Pressable key={item.place_id} accessibilityRole="button" accessibilityLabel={`${item.title}, ${item.subtitle}`}
        testID={`${testID}-suggestion-${item.place_id}`} onPress={() => choose(item)} style={{padding: space.sm, minHeight: 52}}>
        <Text style={{color: colors.onSurface, fontWeight: '600'}}>{item.title}</Text>
        <Text style={{color: colors.muted, fontSize: 12}}>{item.subtitle}</Text>
      </Pressable>)}
    </View> : null}
    {error ? <Text accessibilityRole="alert" style={{fontSize: 12, color: colors.muted}}>{error}</Text> : null}
    <Text style={{fontSize: 12, color: colors.muted}}>Add your house / flat number after choosing an address.</Text>
  </View>;
}
