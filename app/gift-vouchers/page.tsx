import { permanentRedirect } from 'next/navigation';

/**
 * The gift-voucher page used to live here as a "coming at M8" placeholder, and the
 * footer still linked to it after M8 shipped the real thing at /gift — so the one
 * link most likely to be followed by somebody ready to spend money led to a page
 * saying the feature did not exist yet.
 *
 * A permanent redirect rather than a deletion: the placeholder was live long enough
 * to be indexed, and anything already linking here should land on the real page.
 */
export default function GiftVouchersPage() {
  permanentRedirect('/gift');
}
