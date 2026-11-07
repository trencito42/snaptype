import React, { useState } from 'react';
import { X, Search, Sparkles, Calendar, CheckSquare, GitFork, Calculator, Table, Link2, FileText, Globe } from 'lucide-react';

interface CommandItem {
  name: string;
  syntax: string;
  description: string;
  example: string;
}

interface CommandCategory {
  id: string;
  name: string;
  icon: React.ReactNode;
  items: CommandItem[];
}

const COMMAND_CATEGORIES: CommandCategory[] = [
  {
    id: 'basics',
    name: 'Basics',
    icon: <Sparkles size={16} />,
    items: [
      { name: 'Cursor Position', syntax: '{{cursor}}', description: 'Sets final cursor caret placement after expansion', example: 'Hello {{cursor}}, thank you for reaching out.' },
      { name: 'Clipboard Content', syntax: '{{clipboard}}', description: 'Inserts current clipboard text', example: 'Tracking ID: {{clipboard}}' },
      { name: 'Selected Text', syntax: '{{selectedText}}', description: 'Inserts highlighted text prior to expansion', example: 'Quote: "{{selectedText}}"' }
    ]
  },
  {
    id: 'datetime',
    name: 'Date & Time',
    icon: <Calendar size={16} />,
    items: [
      { name: 'Current Date', syntax: '{{date}}', description: 'Current date formatted as YYYY-MM-DD', example: 'Date: {{date}}' },
      { name: 'Current Time', syntax: '{{time}}', description: 'Current time formatted as HH:mm', example: 'Time: {{time}}' },
      { name: 'Full Timestamp', syntax: '{{datetime}}', description: 'Current ISO date & time', example: 'Timestamp: {{datetime}}' },
      { name: 'Future Date (+7 days)', syntax: '{{date:+7d}}', description: 'Date shifted forward by 7 days', example: 'Due date: {{date:+7d}}' },
      { name: 'Past Date (-30 days)', syntax: '{{date:-30d}}', description: 'Date shifted backward by 30 days', example: 'Statement period: {{date:-30d}} to {{date}}' },
      { name: 'Custom Format', syntax: '{{date:DD/MM/YYYY}}', description: 'Date with custom formatting tokens', example: 'Created: {{date:DD/MM/YYYY}}' }
    ]
  },
  {
    id: 'forms',
    name: 'Form Fields',
    icon: <CheckSquare size={16} />,
    items: [
      { name: 'Text Input', syntax: '{{form:client_name}}', description: 'Prompts for a short single-line text input', example: 'Dear {{form:client_name}},' },
      { name: 'Paragraph / Notes', syntax: '{{form:issue_summary|type=paragraph}}', description: 'Prompts for multi-line textarea input', example: 'Notes:\n{{form:issue_summary|type=paragraph}}' },
      { name: 'Dropdown Menu', syntax: '{{form:status|options="Open,Pending,Resolved"}}', description: 'Prompts for selection from dropdown', example: 'Ticket marked as: {{form:status|options="Open,Pending,Resolved"}}' },
      { name: 'Yes/No Toggle', syntax: '{{form:priority|type=toggle}}', description: 'Checkbox toggle prompt', example: 'Priority escalated: {{form:priority|type=toggle}}' },
      { name: 'Date Picker', syntax: '{{form:scheduled_date|type=date}}', description: 'Interactive date selection prompt', example: 'Meeting scheduled on: {{form:scheduled_date|type=date}}' }
    ]
  },
  {
    id: 'logic',
    name: 'Dynamic Logic',
    icon: <GitFork size={16} />,
    items: [
      { name: 'Conditional Block (If/Else)', syntax: '{{#if urgent}}URGENT: Please expedite!{{else}}Standard processing.{{/if}}', description: 'Shows content conditionally based on variable', example: '{{#if urgent}}High Priority{{else}}Normal{{/if}}' },
      { name: 'Repeat Loop', syntax: '{{#repeat 3}}\n- Item {{cursor}}\n{{/repeat}}', description: 'Repeats a template block n times', example: '{{#repeat 3}}* Checklist item\n{{/repeat}}' }
    ]
  },
  {
    id: 'formulas',
    name: 'Formulas & Math',
    icon: <Calculator size={16} />,
    items: [
      { name: 'Math Calculation', syntax: '{{calc:price * 1.20}}', description: 'Evaluates arithmetic (+, -, *, /, ^, %)', example: 'Total with 20% VAT: ${{calc:price * 1.20}}' },
      { name: 'Rounding Function', syntax: '{{calc:round(subtotal * 0.05, 2)}}', description: 'Mathematical functions (round, ceil, floor, abs)', example: 'Tax: ${{calc:round(subtotal * 0.05, 2)}}' }
    ]
  },
  {
    id: 'tables',
    name: 'Data Tables',
    icon: <Table size={16} />,
    items: [
      { name: 'Table Lookup', syntax: '{{table:customers|lookup=email|value=user@example.com|column=name}}', description: 'Pulls data dynamically from workspace tables', example: 'Hello {{table:customers|lookup=email|value=user@example.com|column=name}}' }
    ]
  },
  {
    id: 'composition',
    name: 'Composition',
    icon: <Link2 size={16} />,
    items: [
      { name: 'Include Snippet', syntax: '{{include:signature}}', description: 'Reuses another snippet by its shortcut', example: 'Best regards,\n{{include:signature}}' }
    ]
  },
  {
    id: 'notes',
    name: 'Internal Notes',
    icon: <FileText size={16} />,
    items: [
      { name: 'Internal Guidance', syntax: '{{note:Verify customer ID before sending this response.}}', description: 'Visible to agents in preview, stripped before insertion', example: '{{note:Check KYC first}} Hello {{client}}' }
    ]
  },
  {
    id: 'context',
    name: 'Browser Context',
    icon: <Globe size={16} />,
    items: [
      { name: 'Site Hostname', syntax: '{{site:hostname}}', description: 'Active website domain (e.g. zendesk.com)', example: 'Origin: {{site:hostname}}' },
      { name: 'Full URL', syntax: '{{site:url}}', description: 'Full current page URL', example: 'Ref: {{site:url}}' }
    ]
  }
];

interface CommandBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertCommand: (syntax: string) => void;
}

export const CommandBrowserModal: React.FC<CommandBrowserModalProps> = ({
  isOpen,
  onClose,
  onInsertCommand
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('basics');
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const currentCat = COMMAND_CATEGORIES.find(c => c.id === selectedCategory) || COMMAND_CATEGORIES[0];

  const filteredItems = search.trim()
    ? COMMAND_CATEGORIES.flatMap(c => c.items).filter(i =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.syntax.toLowerCase().includes(search.toLowerCase()) ||
        i.description.toLowerCase().includes(search.toLowerCase())
      )
    : currentCat.items;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        width: 'min(760px, calc(100vw - 24px))',
        height: 'min(520px, calc(100dvh - 24px))',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 20px 40px rgba(0,0,0,0.1)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sparkles size={18} style={{ color: 'var(--accent-hover)' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Command Browser & Dynamic Tags</h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-subtle)' }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-secondary)' }} />
            <input
              type="text"
              className="input"
              style={{ paddingLeft: 34, height: 36, fontSize: 13 }}
              placeholder="Search commands, dynamic tags, formulas, forms..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {/* Body */}
        <div className="stack-sm" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Sidebar */}
          {!search.trim() && (
            <div className="stack-sm-side" style={{
              width: 190,
              borderRight: '1px solid var(--border)',
              padding: '10px 8px',
              overflowY: 'auto',
              background: 'var(--surface)'
            }}>
              {COMMAND_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: 'none',
                    background: selectedCategory === cat.id ? 'var(--surface-subtle)' : 'transparent',
                    color: selectedCategory === cat.id ? 'var(--ink)' : 'var(--text-secondary)',
                    fontWeight: selectedCategory === cat.id ? 700 : 500,
                    fontSize: 13,
                    cursor: 'pointer',
                    textAlign: 'left',
                    marginBottom: 2
                  }}
                >
                  {cat.icon}
                  {cat.name}
                </button>
              ))}
            </div>
          )}

          {/* Items Content */}
          <div style={{ flex: 1, padding: '16px 20px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredItems.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: 12,
                    background: 'var(--surface)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{item.name}</span>
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ padding: '3px 10px', fontSize: 12 }}
                      onClick={() => {
                        onInsertCommand(item.syntax);
                        onClose();
                      }}
                    >
                      Insert
                    </button>
                  </div>
                  <div style={{
                    fontFamily: 'monospace',
                    fontSize: 12,
                    background: 'var(--surface-subtle)',
                    padding: '4px 8px',
                    borderRadius: 4,
                    color: 'var(--ink)',
                    marginBottom: 6,
                    display: 'inline-block'
                  }}>
                    {item.syntax}
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 6px 0' }}>
                    {item.description}
                  </p>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    <strong>Example:</strong> <span style={{ fontStyle: 'italic' }}>{item.example}</span>
                  </div>
                </div>
              ))}
              {filteredItems.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)', fontSize: 13 }}>
                  No commands matching "{search}"
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

