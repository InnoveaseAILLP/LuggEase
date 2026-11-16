import React from 'react';
import {fireEvent,render,waitFor} from '@testing-library/react-native';
import {AgreementReview} from '../src/components/agreement-review';
import {api} from '../src/api';
jest.mock('../src/api',()=>({api:jest.fn()}));
jest.mock('../src/invoice-download',()=>({downloadDocument:jest.fn()}));
jest.mock('@tanstack/react-query',()=>({useQuery:()=>({data:undefined})}));
jest.mock('../src/theme',()=>({useTheme:()=>({colors:{}})}));
const mockAgreementToast=jest.fn();
jest.mock('../src/components/ui',()=>{
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 const R=require('react'),N=require('react-native');
 return {Card:N.View,SectionTitle:N.Text,space:{sm:8},inr:String,useToast:()=>mockAgreementToast,Button:(p:any)=>R.createElement(N.Pressable,{onPress:p.onPress,disabled:p.disabled,testID:p.title,accessibilityState:{disabled:!!p.disabled}},R.createElement(N.Text,null,p.title))};
});
test('ownership review is required before booking and changes invalidate acceptance',async()=>{
 const ready=jest.fn();const payload={pickup_address:'Test Pickup'};
 (api as jest.Mock).mockResolvedValueOnce({agreement_id:'LTA-TEST',status:'pending_review',document_sha256:'a'.repeat(64),ownership_declaration:'I own these goods.',expires_at:new Date(Date.now()+60000).toISOString(),quote:{grand_total:200}});
 const view=render(<AgreementReview payload={payload} onReady={ready}/>);
 fireEvent.press(view.getByText('Generate transfer agreement'));
 await waitFor(()=>expect(api).toHaveBeenCalled());
 expect(mockAgreementToast.mock.calls).toEqual([]);
 await waitFor(()=>expect(view.getByText(/Review the document and confirm ownership/)).toBeTruthy(),{timeout:5000});
 expect(ready).not.toHaveBeenCalledWith('LTA-TEST');
 const button=view.getByTestId('Accept agreement and ownership declaration');
 expect(button.props.accessibilityState.disabled).toBe(true);
 fireEvent(view.getByTestId('ownership-declaration-checkbox'),'valueChange',true);
 expect(button.props.accessibilityState.disabled).toBe(false);
 (api as jest.Mock).mockResolvedValueOnce({status:'reviewed'});
 fireEvent.press(view.getByText('Accept agreement and ownership declaration'));
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/agreements/LTA-TEST/accept',{body:{ownership_confirmed:true,agreement_sha256:'a'.repeat(64)}}));
 await waitFor(()=>expect(ready).toHaveBeenCalledWith('LTA-TEST'));
 view.rerender(<AgreementReview payload={{pickup_address:'Changed'}} onReady={ready}/>);
 await waitFor(()=>expect(view.getByText('Generate transfer agreement')).toBeTruthy());
});
