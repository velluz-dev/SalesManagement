import { useState, type ComponentProps } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { translate } from '../../i18n';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/ui/Button';
import { CustomerSelect } from '../../components/ui/Pickers';
import { CustomerFormModal } from './CustomerForm';

export function CustomerPicker({ onCreated, ...props }: ComponentProps<typeof CustomerSelect> & { onCreated: (id: string) => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const canCreate = can('customer.create');

  return (
    <>
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <CustomerSelect {...props} empty={canCreate ? 'No customers yet. Add your first customer to continue.' : 'No customers yet. Ask a salesperson to add one.'} />
        </div>
        {canCreate && (
          <Button type="button" variant="secondary" icon={Plus} onClick={() => setAdding(true)} className="shrink-0">
            {translate('New customer')}
          </Button>
        )}
      </div>
      {canCreate && (
        <CustomerFormModal
          open={adding}
          onClose={() => setAdding(false)}
          onSaved={async (c) => {
            await qc.invalidateQueries({ queryKey: ['lookups', 'customers'] });
            onCreated(c.id);
          }}
        />
      )}
    </>
  );
}
