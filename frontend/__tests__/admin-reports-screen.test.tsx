import React from 'react';
import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
import AdminReports from '../app/admin-reports';
import {useAuth} from '../src/auth';
import {useQuery} from '@tanstack/react-query';
import {saveReportCSV} from '../src/report-download';
jest.mock('../src/auth',()=>({useAuth:jest.fn()}));
jest.mock('@tanstack/react-query',()=>({useQuery:jest.fn()}));
jest.mock('../src/router',()=>({useRouter:()=>({back:jest.fn()})}));
jest.mock('../src/report-download',()=>({saveReportCSV:jest.fn().mockResolvedValue('Downloaded')}));
jest.mock('../src/components/ui',()=>{
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R=require('react'),N=require('react-native');
  return {Card:N.View,SectionTitle:N.Text,ScreenHeader:()=>null,space:{lg:16,md:12},useToast:()=>jest.fn(),
    Row:(p:any)=>R.createElement(N.Text,null,p.label+': '+p.value),Input:(p:any)=>R.createElement(N.TextInput,{...p,accessibilityLabel:p.label}),
    Button:(p:any)=>R.createElement(N.Pressable,{testID:p.testID||p.title,onPress:p.onPress,disabled:p.disabled||p.loading},R.createElement(N.Text,null,p.title))};
});
const data={start_date:'2026-11-01',end_date:'2026-11-16',summary:{orders:2,invoiced_paise:20000},basis:'Test accounting basis',notes:['Test scope'],
  daily:[{period:'2026-11-16',orders:2,invoiced_paise:20000}],transactions:[{kind:'payment_captured',amount_paise:10000}],pickup_cities:[{name:'Coimbatore',state:'Tamil Nadu',orders:2}]};
beforeEach(()=>{
  jest.clearAllMocks();(useAuth as jest.Mock).mockReturnValue({user:{role:'admin'}});
  (useQuery as jest.Mock).mockImplementation(options=>({data:options.queryKey[0]==='admin-reports'?data:{users:[{user_id:'test',name:'Test Partner',email:'test@example.com',role:'partner',partner_status:'pending'}],total:1},refetch:jest.fn()}));
});
test('reports show accounting basis and export the selected report, not a truncated preview',async()=>{
  const v=render(<AdminReports/>);expect(v.getByText('Test accounting basis')).toBeTruthy();
  fireEvent.press(v.getByText('Transactions'));
  await act(async()=>{fireEvent.press(v.getByTestId('admin-report-download'));});
  await waitFor(()=>expect(saveReportCSV).toHaveBeenCalledWith(expect.stringContaining('payment_captured'),expect.stringContaining('LuggEase-Report-transactions-')));
});
test('directory identifies assigned roles and approval status',()=>{
  const v=render(<AdminReports/>);fireEvent.press(v.getByText('Account directory'));
  expect(v.getByText('Test Partner')).toBeTruthy();expect(v.getByText('Partner application: pending')).toBeTruthy();
});
test('customer cannot render administrator reports or enable their queries',()=>{
  (useAuth as jest.Mock).mockReturnValue({user:{role:'customer'}});const v=render(<AdminReports/>);
  expect(v.getByText('Administrator access is required.')).toBeTruthy();
  expect((useQuery as jest.Mock).mock.calls.every(([options])=>options.enabled===false)).toBe(true);
  expect(v.queryByTestId('admin-report-download')).toBeNull();
});
