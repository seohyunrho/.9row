import { createCloudAutofill } from '../../lib/cloud-autofill.mjs';
import { createSupabaseStore } from '../../lib/supabase-store.mjs';

let store;
export default createCloudAutofill({ getStore: () => (store ||= createSupabaseStore()) });
