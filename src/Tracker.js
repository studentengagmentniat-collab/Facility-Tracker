import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

const STAGES = [
  { key: 'raised',       label: 'Request Raised',  short: 'Raised',   color: '#f59e0b', who: 'You' },
  { key: 'mgr_approved', label: 'Manager Approved', short: 'Mgr Apvd', color: '#3b82f6', who: 'Manager' },
  { key: 'pr_raised',    label: 'PR Raised',        short: 'PR Raised', color: '#8b5cf6', who: 'Facility' },
  { key: 'pr_approved',  label: 'PR Approved',      short: 'PR Apvd',  color: '#10b981', who: 'Finance' },
  { key: 'ordered',      label: 'Order Placed',     short: 'Ordered',  color: '#06b6d4', who: 'Facility' },
  { key: 'received',     label: 'Received',         short: 'Received', color: '#22c55e', who: 'You' },
];

const NOTIF_TEXT = {
  raised:       'Request raised and sent to Facility Manager for approval.',
  mgr_approved: 'Manager approved. Facility team is preparing the Purchase Request.',
  pr_raised:    'Purchase Request raised. Waiting for PR approval.',
  pr_approved:  'PR approved! Order is being placed with the vendor.',
  ordered:      'Order placed with vendor. You will be notified on delivery.',
  received:     'Item received successfully. Request is complete!',
  rejected:     'This request has been rejected.',
};

const NOTIF_COLORS = {
  raised: '#fef3c7', mgr_approved: '#eff6ff', pr_raised: '#f5f3ff',
  pr_approved: '#f0fdf4', ordered: '#ecfeff', received: '#f0fdf4', rejected: '#fef2f2',
};
const NOTIF_TEXT_COLORS = {
  raised: '#92400e', mgr_approved: '#1e40af', pr_raised: '#5b21b6',
  pr_approved: '#166534', ordered: '#155e75', received: '#166534', rejected: '#991b1b',
};

export default function Tracker({ user, profile, onLogout }) {
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState('main');
  const [updates, setUpdates] = useState([]);
  const [unread, setUnread] = useState(0);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    const { data } = await supabase.from('requests').select('*, remarks(*)').order('created_at', { ascending: false });
    if (data) setRequests(data);
    setLoading(false);
  }, []);

  const fetchUpdates = useCallback(async () => {
    const { data } = await supabase.from('updates').select('*').order('created_at', { ascending: false }).limit(50);
    if (data) setUpdates(data);
  }, []);

  useEffect(() => { fetchRequests(); fetchUpdates(); }, [fetchRequests, fetchUpdates]);

  useEffect(() => {
    const ch = supabase.channel('realtime-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, () => fetchRequests())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'remarks' }, () => fetchRequests())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'updates' }, (payload) => {
        setUpdates(prev => [payload.new, ...prev]);
        setUnread(prev => prev + 1);
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [fetchRequests]);

  async function sendEmailNotification(req, newStatus, remarkText) {
    const statusLabel = STAGES.find(s => s.key === newStatus)?.label || newStatus;
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 're_dh9wXyp1_B5KvDVzw28TMc3ybFeqQ9yJ6', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Facility Tracker <onboarding@resend.dev>',
          to: [user.email],
          subject: `[Facility Tracker] ${req.req_id} — ${statusLabel}`,
          html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px;">
            <h2 style="color:#111;margin-bottom:4px;">Facility Request Update</h2>
            <p style="color:#666;font-size:14px;margin-bottom:20px;">Your request has been updated.</p>
            <div style="background:#f9fafb;border-radius:10px;padding:16px;margin-bottom:16px;">
              <div style="font-size:13px;color:#888;margin-bottom:4px;">${req.req_id} — ${req.title}</div>
              <div style="font-size:16px;font-weight:600;color:#111;margin-bottom:8px;">Status: ${statusLabel}</div>
              <div style="font-size:14px;color:#444;">${NOTIF_TEXT[newStatus] || ''}</div>
              ${remarkText ? `<div style="margin-top:12px;padding:10px;background:#fff;border-radius:8px;font-size:13px;color:#555;border:1px solid #e5e7eb;">Remark: ${remarkText}</div>` : ''}
            </div>
            <div style="font-size:12px;color:#aaa;">Product: ${req.product_name} | Total: ₹${Number(req.total_cost).toLocaleString('en-IN')}</div>
          </div>`
        })
      });
    } catch (e) { console.log('Email error', e); }
  }

  async function advance(req) {
    const idx = STAGES.findIndex(s => s.key === req.status);
    if (idx >= STAGES.length - 1) return;
    const newStatus = STAGES[idx + 1].key;
    const pr = (newStatus === 'pr_raised' && !req.pr_number) ? 'PR-' + String(Math.floor(Math.random() * 9000) + 1000) : req.pr_number;
    await supabase.from('requests').update({ status: newStatus, pr_number: pr }).eq('id', req.id);
    const upd = { request_id: req.id, req_id: req.req_id, title: req.title, status: newStatus, status_label: STAGES[idx + 1].label, remark: '', updated_by: profile?.name || user.email };
    await supabase.from('updates').insert(upd);
    await sendEmailNotification(req, newStatus, '');
    fetchRequests();
  }

  async function reject(req) {
    await supabase.from('requests').update({ status: 'rejected' }).eq('id', req.id);
    const upd = { request_id: req.id, req_id: req.req_id, title: req.title, status: 'rejected', status_label: 'Rejected', remark: '', updated_by: profile?.name || user.email };
    await supabase.from('updates').insert(upd);
    await sendEmailNotification(req, 'rejected', '');
    fetchRequests();
  }

  async function submitRemark(reqId, remarkText, remarkBy) {
    const req = requests.find(r => r.id === reqId);
    await supabase.from('remarks').insert({ request_id: reqId, text: remarkText, added_by: remarkBy, added_by_email: user.email });
    const upd = { request_id: reqId, req_id: req.req_id, title: req.title, status: req.status, status_label: STAGES.find(s => s.key === req.status)?.label || req.status, remark: `[${remarkBy}] ${remarkText}`, updated_by: profile?.name || user.email };
    await supabase.from('updates').insert(upd);
    await sendEmailNotification(req, req.status, `[${remarkBy}] ${remarkText}`);
    fetchRequests();
    setModal(null);
  }

  async function submitNew(form) {
    const count = requests.length + 1;
    const req_id = 'REQ-' + String(count).padStart(3, '0');
    const totalCost = parseFloat(form.cost) * parseInt(form.qty);
    const { data } = await supabase.from('requests').insert({
      req_id, title: form.productName, dept: form.dept, status: 'raised',
      product_name: form.productName, product_link: form.productLink,
      unit_cost: parseFloat(form.cost), qty: parseInt(form.qty), total_cost: totalCost,
      notes: form.notes, created_by: profile?.name || user.email, created_by_email: user.email
    }).select().single();
    if (data) {
      if (form.remark) await supabase.from('remarks').insert({ request_id: data.id, text: form.remark, added_by: profile?.name || 'Student Engagement', added_by_email: user.email });
      await supabase.from('updates').insert({ request_id: data.id, req_id, title: form.productName, status: 'raised', status_label: 'Request Raised', remark: form.remark || '', updated_by: profile?.name || user.email });
      await sendEmailNotification({ ...data, req_id }, 'raised', form.remark);
    }
    fetchRequests(); setModal(null);
  }

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);
  const s = { fontFamily: 'Inter, sans-serif', padding: '1rem', maxWidth: '900px', margin: '0 auto' };
  const card = { background: '#fff', border: '1px solid #e8e8e8', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '12px' };
  const btn = (color) => ({ border: `1px solid ${color}22`, background: color + '15', color, padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' });

  return (
    <div style={s}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <div style={{ fontSize: '20px', fontWeight: '600', color: '#111' }}>Facility Tracker</div>
          <div style={{ fontSize: '12px', color: '#888' }}>Welcome, {profile?.name || user.email} ({profile?.role === 'facility' ? 'Facility Team' : 'Student Engagement Team'})</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button style={btn('#6366f1')} onClick={() => { setView(view === 'updates' ? 'main' : 'updates'); if (view !== 'updates') setUnread(0); }}>
            Updates {unread > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: '10px', padding: '1px 5px', fontSize: '10px', marginLeft: '3px' }}>{unread}</span>}
          </button>
          {profile?.role === 'student_engagement' && <button style={btn('#1a73e8')} onClick={() => setModal('new')}>+ New Request</button>}
          <button style={btn('#888')} onClick={onLogout}>Logout</button>
        </div>
      </div>

      {profile?.role === 'student_engagement' && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#1e40af', marginBottom: '1rem' }}>
          You can raise requests and add remarks. Only the Facility Team can advance or reject requests.
        </div>
      )}
      {profile?.role === 'facility' && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#166534', marginBottom: '1rem' }}>
          You can advance or reject requests and add remarks.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '6px', marginBottom: '1rem' }}>
        {STAGES.map(st => {
          const count = requests.filter(r => r.status === st.key).length;
          return <div key={st.key} style={{ background: '#f9fafb', borderRadius: '8px', padding: '8px 4px', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontWeight: '600', color: st.color }}>{count}</div>
            <div style={{ fontSize: '10px', color: '#888', marginTop: '2px', lineHeight: '1.3' }}>{st.short}</div>
          </div>;
        })}
      </div>

      {view === 'updates' ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ fontWeight: '500', fontSize: '15px' }}>Update Notifications</div>
            <button style={btn('#888')} onClick={() => setView('main')}>Back</button>
          </div>
          {updates.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: '#aaa', fontSize: '14px' }}>No updates yet.</div>}
          {updates.map((u, i) => {
            const st = STAGES.find(s => s.key === u.status);
            return <div key={i} style={{ ...card, display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: st?.color || '#888', flexShrink: 0, marginTop: '5px' }}></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: '500' }}>{u.req_id} — {u.title}</div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>Moved to <span style={{ color: st?.color, fontWeight: '500' }}>{u.status_label}</span> by {u.updated_by}</div>
                {u.remark && <div style={{ fontSize: '12px', marginTop: '4px', color: '#444' }}>{u.remark}</div>}
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '10px', background: '#eff6ff', color: '#1d4ed8' }}>Notified: You</span>
                  <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '10px', background: '#f0fdf4', color: '#166534' }}>Notified: Facility Team</span>
                  <span style={{ fontSize: '11px', color: '#aaa', marginLeft: 'auto' }}>{new Date(u.created_at).toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>;
          })}
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {[{ key: 'all', label: 'All' }, ...STAGES, { key: 'rejected', label: 'Rejected', color: '#ef4444' }].map(t => (
              <button key={t.key} onClick={() => setFilter(t.key)} style={{ fontSize: '12px', padding: '4px 11px', borderRadius: '20px', cursor: 'pointer', border: '1px solid', borderColor: filter === t.key ? '#1a73e8' : '#e0e0e0', color: filter === t.key ? '#1a73e8' : '#666', background: filter === t.key ? '#eff6ff' : 'transparent', fontFamily: 'inherit' }}>{t.label}</button>
            ))}
          </div>

          {loading && <div style={{ textAlign: 'center', padding: '2rem', color: '#aaa' }}>Loading...</div>}
          {!loading && filtered.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: '#aaa', fontSize: '14px' }}>No requests found.</div>}

          {filtered.map(r => {
            const st = STAGES.find(s => s.key === r.status) || { label: 'Rejected', color: '#ef4444', key: 'rejected' };
            const idx = STAGES.findIndex(s => s.key === r.status);
            const isFacility = profile?.role === 'facility';
            const canAdv = isFacility && r.status !== 'rejected' && idx < STAGES.length - 1;
            const canRej = isFacility && r.status !== 'rejected' && r.status !== 'received';
            const lastRemark = r.remarks?.length ? r.remarks[r.remarks.length - 1] : null;
            const pct = r.status === 'rejected' ? 100 : Math.round(((idx + 1) / STAGES.length) * 100);
            return (
              <div key={r.id} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', color: '#888' }}>{r.req_id}</span>
                  <span style={{ fontSize: '11px', fontWeight: '500', padding: '2px 8px', borderRadius: '20px', background: st.color + '20', color: st.color, border: `1px solid ${st.color}40` }}>{st.label}</span>
                  {r.pr_number && <span style={{ fontSize: '11px', color: '#888' }}>{r.pr_number}</span>}
                  <div style={{ flex: 1 }} />
                  <button style={btn('#6366f1')} onClick={() => setModal({ type: 'detail', req: r })}>Details</button>
                  <button style={btn('#3b82f6')} onClick={() => setModal({ type: 'remark', req: r })}>+ Remark</button>
                  {canAdv && <button style={btn('#22c55e')} onClick={() => advance(r)}>Advance</button>}
                  {canRej && <button style={btn('#ef4444')} onClick={() => reject(r)}>Reject</button>}
                </div>
                <div style={{ fontSize: '14px', fontWeight: '500', color: '#111' }}>{r.title}</div>
                <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>{r.dept} · Raised {new Date(r.created_at).toLocaleDateString('en-IN')}</div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginTop: '10px' }}>
                  <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '7px 9px' }}>
                    <div style={{ fontSize: '10px', color: '#888' }}>Product</div>
                    <div style={{ fontSize: '12px', fontWeight: '500', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.product_name}>{r.product_name}</div>
                  </div>
                  <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '7px 9px' }}>
                    <div style={{ fontSize: '10px', color: '#888' }}>Unit · Qty</div>
                    <div style={{ fontSize: '12px', fontWeight: '500', marginTop: '2px' }}>₹{Number(r.unit_cost).toLocaleString('en-IN')} × {r.qty}</div>
                  </div>
                  <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '7px 9px' }}>
                    <div style={{ fontSize: '10px', color: '#888' }}>Total cost</div>
                    <div style={{ fontSize: '13px', fontWeight: '500', color: '#16a34a', marginTop: '2px' }}>₹{Number(r.total_cost).toLocaleString('en-IN')}</div>
                  </div>
                </div>
                {r.product_link && <a href={r.product_link} target="_blank" rel="noreferrer" style={{ fontSize: '11px', display: 'inline-block', marginTop: '6px', padding: '2px 8px', borderRadius: '10px', background: '#eff6ff', color: '#1d4ed8', textDecoration: 'none' }}>View product link</a>}

                <div style={{ display: 'flex', marginTop: '10px', borderRadius: '8px', overflow: 'hidden' }}>
                  {STAGES.map((s, i) => {
                    let bg = '#f3f4f6'; let color = '#aaa';
                    if (i < idx) { bg = '#dcfce7'; color = '#16a34a'; }
                    else if (i === idx && r.status !== 'rejected') { bg = '#eff6ff'; color = '#1d4ed8'; }
                    return <div key={s.key} style={{ flex: 1, textAlign: 'center', padding: '6px 2px', fontSize: '9px', fontWeight: '500', background: bg, color, borderRight: i < STAGES.length - 1 ? '1px solid #fff' : 'none' }}>
                      <div style={{ fontSize: '13px', fontWeight: '600' }}>{i + 1}</div>{s.short}
                    </div>;
                  })}
                </div>
                <div style={{ height: '4px', background: '#f3f4f6', borderRadius: '2px', overflow: 'hidden', marginTop: '6px' }}>
                  <div style={{ height: '100%', width: pct + '%', background: st.color, borderRadius: '2px', transition: 'width 0.3s' }} />
                </div>
                <div style={{ background: NOTIF_COLORS[r.status] || '#f9fafb', border: `1px solid ${st.color}30`, borderRadius: '8px', padding: '8px 10px', fontSize: '12px', color: NOTIF_TEXT_COLORS[r.status] || '#444', marginTop: '8px' }}>
                  <span style={{ fontWeight: '500' }}>Status update — Notified: You & Facility Team · </span>{NOTIF_TEXT[r.status]}
                </div>
                {lastRemark && <div style={{ marginTop: '6px', background: '#f9fafb', borderRadius: '8px', padding: '7px 10px', fontSize: '12px' }}><span style={{ color: '#888', fontWeight: '500' }}>{lastRemark.added_by}: </span>{lastRemark.text}</div>}
              </div>
            );
          })}
        </div>
      )}

      {modal && <ModalLayer modal={modal} onClose={() => setModal(null)} onRemark={submitRemark} onNew={submitNew} profile={profile} user={user} />}
    </div>
  );
}

function ModalLayer({ modal, onClose, onRemark, onNew, profile }) {
  const [form, setForm] = useState({ dept: 'Admin', productName: '', productLink: '', cost: '', qty: '', notes: '', remark: '' });
  const [remarkText, setRemarkText] = useState('');
  const [remarkBy, setRemarkBy] = useState(profile?.name || 'Student Engagement');
  const totalCost = (parseFloat(form.cost) || 0) * (parseInt(form.qty) || 0);
  const inp = { width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #e0e0e0', borderRadius: '8px', marginTop: '3px', fontFamily: 'inherit', background: '#fff', color: '#111', boxSizing: 'border-box' };
  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '2rem 1rem', overflowY: 'auto' };
  const box = { background: '#fff', borderRadius: '14px', padding: '1.5rem', width: '100%', maxWidth: '480px' };

  if (modal === 'new') return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={box}>
        <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Raise New Request</div>
        <div style={{ fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Request Details</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div><label style={{ fontSize: '12px', color: '#666' }}>Department</label>
            <select style={inp} value={form.dept} onChange={e => setForm({ ...form, dept: e.target.value })}>
              {['Admin','IT','HR','Ops','Finance','Maintenance'].map(d => <option key={d}>{d}</option>)}
            </select></div>
          <div><label style={{ fontSize: '12px', color: '#666' }}>Quantity *</label>
            <input style={inp} type="number" min="1" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} placeholder="e.g. 5" /></div>
        </div>
        <div style={{ marginTop: '10px' }}><label style={{ fontSize: '12px', color: '#666' }}>Reason / Notes</label>
          <textarea style={{ ...inp, marginTop: '3px' }} rows="2" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Why is this needed?" /></div>
        <div style={{ height: '1px', background: '#f0f0f0', margin: '14px 0' }} />
        <div style={{ fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Product Details</div>
        <div><label style={{ fontSize: '12px', color: '#666' }}>Product name *</label>
          <input style={inp} value={form.productName} onChange={e => setForm({ ...form, productName: e.target.value })} placeholder="e.g. Ergonomic Office Chair - Model X200" /></div>
        <div style={{ marginTop: '10px' }}><label style={{ fontSize: '12px', color: '#666' }}>Product link (URL)</label>
          <input style={inp} type="url" value={form.productLink} onChange={e => setForm({ ...form, productLink: e.target.value })} placeholder="https://www.amazon.in/dp/..." /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
          <div><label style={{ fontSize: '12px', color: '#666' }}>Unit cost (₹) *</label>
            <input style={inp} type="number" min="0" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} placeholder="e.g. 12500" /></div>
          <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', justifyContent: 'center', marginTop: '3px' }}>
            <div style={{ fontSize: '11px', color: '#888' }}>Total cost</div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#16a34a' }}>₹{totalCost.toLocaleString('en-IN')}</div>
          </div>
        </div>
        <div style={{ height: '1px', background: '#f0f0f0', margin: '14px 0' }} />
        <div style={{ fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Initial Remark</div>
        <textarea style={inp} rows="2" value={form.remark} onChange={e => setForm({ ...form, remark: e.target.value })} placeholder="Any comment for the facility team..." />
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #e0e0e0', borderRadius: '8px', background: 'transparent', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={() => { if (!form.productName || !form.cost || !form.qty) return; onNew(form); }} style={{ padding: '8px 16px', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500', fontFamily: 'inherit' }}>Raise Request</button>
        </div>
      </div>
    </div>
  );

  if (modal?.type === 'remark') {
    const r = modal.req;
    return (
      <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
        <div style={box}>
          <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>Add Remark</div>
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>{r.req_id} — {r.title}</div>
          <div><label style={{ fontSize: '12px', color: '#666' }}>Remark by</label>
            <select style={inp} value={remarkBy} onChange={e => setRemarkBy(e.target.value)}>
              <option>{profile?.name || 'Student Engagement'}</option>
              <option>Facility Team</option>
            </select></div>
          <div style={{ marginTop: '10px' }}><label style={{ fontSize: '12px', color: '#666' }}>Remark *</label>
            <textarea style={{ ...inp, marginTop: '3px' }} rows="3" value={remarkText} onChange={e => setRemarkText(e.target.value)} placeholder="Type your remark..." /></div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #e0e0e0', borderRadius: '8px', background: 'transparent', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}>Cancel</button>
            <button onClick={() => { if (!remarkText.trim()) return; onRemark(r.id, remarkText, remarkBy); }} style={{ padding: '8px 16px', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500', fontFamily: 'inherit' }}>Submit</button>
          </div>
        </div>
      </div>
    );
  }

  if (modal?.type === 'detail') {
    const r = modal.req;
    return (
      <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
        <div style={box}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ fontSize: '15px', fontWeight: '600' }}>{r.req_id} — {r.title}</div>
            <button onClick={onClose} style={{ border: '1px solid #e0e0e0', background: 'transparent', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>Close</button>
          </div>
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>{r.dept} · {new Date(r.created_at).toLocaleDateString('en-IN')}{r.pr_number ? ' · ' + r.pr_number : ''}</div>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Product Details</div>
          <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '12px', marginBottom: '14px' }}>
            <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '8px' }}>{r.product_name}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <div><div style={{ fontSize: '11px', color: '#888' }}>Unit cost</div><div style={{ fontWeight: '500', fontSize: '13px', marginTop: '2px' }}>₹{Number(r.unit_cost).toLocaleString('en-IN')}</div></div>
              <div><div style={{ fontSize: '11px', color: '#888' }}>Quantity</div><div style={{ fontWeight: '500', fontSize: '13px', marginTop: '2px' }}>{r.qty}</div></div>
              <div><div style={{ fontSize: '11px', color: '#888' }}>Total cost</div><div style={{ fontWeight: '500', fontSize: '13px', color: '#16a34a', marginTop: '2px' }}>₹{Number(r.total_cost).toLocaleString('en-IN')}</div></div>
            </div>
            {r.product_link && <a href={r.product_link} target="_blank" rel="noreferrer" style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: '#eff6ff', color: '#1d4ed8', textDecoration: 'none' }}>View product link</a>}
          </div>
          {r.notes && <><div style={{ fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Notes</div>
            <div style={{ fontSize: '13px', padding: '8px 10px', background: '#f9fafb', borderRadius: '8px', marginBottom: '14px' }}>{r.notes}</div></>}
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Remarks</div>
          {r.remarks?.length ? r.remarks.map((rk, i) => (
            <div key={i} style={{ background: '#f9fafb', borderRadius: '8px', padding: '8px 10px', marginBottom: '6px', fontSize: '12px' }}>
              <div style={{ color: '#111' }}>{rk.text}</div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '3px' }}>{rk.added_by} · {new Date(rk.created_at).toLocaleDateString('en-IN')}</div>
            </div>
          )) : <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '14px' }}>No remarks yet.</div>}
        </div>
      </div>
    );
  }
  return null;
}
