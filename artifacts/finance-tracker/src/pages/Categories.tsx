import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, type ExpenseCategory } from '@/lib/db';
import { Plus, Pencil, Trash2, Tags } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

type CategoryForm = {
  name: string;
  group: string;
  type: 'Expense' | 'Income' | 'Transfer';
};

const defaultCategoryForm: CategoryForm = {
  name: '',
  group: 'General',
  type: 'Expense',
};

export default function Categories() {
  const { toast } = useToast();
  const [dialog, setDialog] = useState<{ open: boolean; editing?: ExpenseCategory }>({ open: false });
  const [form, setForm] = useState<CategoryForm>(defaultCategoryForm);

  const categories = useLiveQuery(() => db.expenseCategories.toArray(), []);

  function openNew() {
    setForm(defaultCategoryForm);
    setDialog({ open: true });
  }

  function openEdit(c: ExpenseCategory) {
    if (c.isSystem) return;
    setForm({ name: c.name, group: c.group, type: c.type });
    setDialog({ open: true, editing: c });
  }

  async function save() {
    if (!form.name.trim() || !form.group.trim()) return;
    
    if (dialog.editing) {
      await db.expenseCategories.update(dialog.editing.id, form);
      toast({ title: 'Category updated' });
    } else {
      await db.expenseCategories.add({
        id: crypto.randomUUID(),
        ...form,
      });
      toast({ title: 'Category created' });
    }
    setDialog({ open: false });
  }

  async function remove(id: string, isSystem?: boolean) {
    if (isSystem) return;
    await db.expenseCategories.delete(id);
    toast({ title: 'Category deleted' });
  }

  // Group categories by Type, then by Group
  const grouped = (categories || []).reduce((acc, cat) => {
    if (!acc[cat.type]) acc[cat.type] = {};
    if (!acc[cat.type][cat.group]) acc[cat.type][cat.group] = [];
    acc[cat.type][cat.group].push(cat);
    return acc;
  }, {} as Record<string, Record<string, ExpenseCategory[]>>);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Categories</h1>
          <p className="text-muted-foreground text-sm">Manage income and expense categories</p>
        </div>
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add Category
        </Button>
      </div>

      {(categories || []).length === 0 && (
        <div className="text-center py-16 text-muted-foreground border rounded-lg border-dashed mt-4">
          <Tags className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p>No categories yet. Add some to organize your transactions.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
        {['Expense', 'Income', 'Transfer'].map(type => {
          if (!grouped[type]) return null;
          return (
            <div key={type} className="space-y-4">
              <h2 className="text-lg font-semibold border-b pb-2">{type}</h2>
              {Object.keys(grouped[type]).sort().map(groupName => (
                <Card key={groupName} className="overflow-hidden">
                  <div className="bg-muted/50 px-4 py-2 font-medium text-sm text-muted-foreground border-b">
                    {groupName}
                  </div>
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {grouped[type][groupName].sort((a,b) => a.name.localeCompare(b.name)).map(cat => (
                        <div key={cat.id} className="flex justify-between items-center px-4 py-3 hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-2">
                            <span>{cat.name}</span>
                            {cat.isSystem && <Badge variant="secondary" className="text-[10px]">System</Badge>}
                          </div>
                          {!cat.isSystem && (
                            <div className="flex gap-1 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(cat)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(cat.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          );
        })}
      </div>

      <Dialog open={dialog.open} onOpenChange={o => setDialog({ open: o })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.editing ? 'Edit Category' : 'New Category'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Category Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Groceries" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as any }))} disabled={!!dialog.editing}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Expense">Expense</SelectItem>
                    <SelectItem value="Income">Income</SelectItem>
                    <SelectItem value="Transfer">Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Group</Label>
                <Input value={form.group} onChange={e => setForm(f => ({ ...f, group: e.target.value }))} placeholder="e.g. Food" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false })}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
