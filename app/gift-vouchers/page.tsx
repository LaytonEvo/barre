import type { Metadata } from 'next';
import { ComingAtMilestone } from '@/components/site/coming-at-milestone';

export const metadata: Metadata = { title: 'Gift vouchers' };

export default function GiftVouchersPage() {
  return (
    <ComingAtMilestone
      title="Gift vouchers"
      milestone="M8"
      summary="Buy a voucher for a fixed amount or a class pack, with the recipient's email, a message and a send date. The recipient gets it on the day you choose."
      needs={['Voucher amounts Kelly wants to offer, and how long they stay valid']}
    />
  );
}
