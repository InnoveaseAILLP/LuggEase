import {UserFacingError} from '@/src/errors';
const IST=330*60*1000;
const DAY=24*60*60*1000;
const pad=(n:number)=>String(n).padStart(2,'0');
export function deliveryInputs(value?:string,now=Date.now()){
 const existing=value?Date.parse(value):NaN;
 const instant=Number.isFinite(existing)&&existing>now&&existing<=now+30*DAY?existing:now+30*60*1000;
 const date=new Date(instant+IST);
 return {date:`${pad(date.getUTCDate())}-${pad(date.getUTCMonth()+1)}-${date.getUTCFullYear()}`,time:`${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`};
}
export function revisedDelivery(dateText:string,timeText:string,reasonText:string,test=false,now=Date.now()){
 const date=/^(\d{2})-(\d{2})-(\d{4})$/.exec(dateText.trim());
 if(!date)throw new UserFacingError('Enter the delivery date as DD-MM-YYYY.');
 const time=/^(\d{1,2}):(\d{2})$/.exec(timeText.trim());
 if(!time||Number(time[1])>23||Number(time[2])>59)throw new UserFacingError('Enter a valid 24-hour delivery time, for example 17:31.');
 const [,day,month,year]=date.map(Number),hour=Number(time[1]),minute=Number(time[2]);
 const local=Date.UTC(year,month-1,day,hour,minute),check=new Date(local);
 if(check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==day)throw new UserFacingError('Enter a valid calendar date.');
 const instant=local-IST;
 if(instant<=now)throw new UserFacingError('Choose a future delivery date and time in India time. The selected time has already passed.');
 if(instant>now+30*DAY)throw new UserFacingError('Choose a delivery date and time within the next 30 days.');
 const reason=reasonText.trim(),minimum=test?4:10;
 if(reason.length<minimum)throw new UserFacingError(`Enter at least ${minimum} characters for the revision reason.`);
 if(reason.length>500)throw new UserFacingError('Keep the revision reason within 500 characters.');
 return {expected_delivery_at:new Date(instant).toISOString(),reason};
}
