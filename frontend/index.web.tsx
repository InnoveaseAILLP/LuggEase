import "./web.css";
import {AppRegistry} from 'react-native';
import App from './App';
AppRegistry.registerComponent('LuggEase', () => App);
AppRegistry.runApplication('LuggEase',{initialProps:{}, rootTag:document.getElementById('root')! as unknown as import('react-native').RootTag});
