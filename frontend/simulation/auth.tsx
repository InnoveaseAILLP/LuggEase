import {createContext,useContext} from 'react';
export const SimulationRole=createContext<'customer'|'partner'>('customer');
export function useAuth(){const role=useContext(SimulationRole);return {user:{partner_status:'approved',user_id:role==='partner'?'SIM-PARTNER':'SIM-CUSTOMER',role}};}
