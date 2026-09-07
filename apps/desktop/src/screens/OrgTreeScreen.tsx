/** الهيكل التنظيمي كما في المرجع + كشف انحراف القاعدة عن الكود (drift) — أداة مدير النظام */
import { useQuery } from '@tanstack/react-query';
import { ORG_STRUCTURE } from '@newport/domain';
import { apiFetch } from '../data/api.js';

interface SubRow {
  id: string;
  code: string;
  nameAr: string;
  isFieldWork: boolean;
  costCenterCode: string | null;
  counts: { users: number; workOrders: number; assets: number };
}
interface DeptRow {
  code: string;
  nameAr: string;
  kind: string;
  costCenterCode: string | null;
  subDepartments: SubRow[];
}

export function OrgTreeScreen() {
  const tree = useQuery({ queryKey: ['org-tree'], queryFn: () => apiFetch<DeptRow[]>('/v1/org/tree') });
  const drift = useQuery({ queryKey: ['org-drift'], queryFn: () => apiFetch<{ isAligned: boolean; missingInDb: string[]; extraInDb: string[]; facility: string }>('/v1/org/drift') });

  const ref = ORG_STRUCTURE;
  const dbCodes = new Set((tree.data ?? []).flatMap((d) => d.subDepartments.map((s) => s.code)));

  return (
    <div className="stack">
      <section className="card">
        <h2>الهيكل التنظيمي — {drift.data?.facility ?? 'BFC-L1'}</h2>
        {tree.data?.map((d) => (
          <div key={d.code} className="dept">
            <h3>
              {d.nameAr} <span className="dim">{d.code}</span> <span className="tag">{d.kind}</span>
            </h3>
            <div className="subs">
              {d.subDepartments.map((s) => (
                <div key={s.id} className="sub">
                  <strong>{s.nameAr}</strong>
                  <span className="dim">{s.code}</span>
                  <span>
                    {s.counts.users} موظف · {s.counts.workOrders} أمر عمل · {s.counts.assets} معدة
                  </span>
                  {s.isFieldWork && <span className="tag">عمل ميداني</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
        {!tree.data && <p className="dim">جارٍ التحميل…</p>}
      </section>

      <section className="card">
        <h2>مطابقة المرجع (من @newport/domain)</h2>
        <div className={drift.data?.isAligned ? 'ok' : 'warn'}>
          {drift.data?.isAligned ? 'القاعدة مطابقة تمامًا للمرجع: 3 أقسام و13 شعبة' : 'انحراف! راجع قائمة النقص/الزيادة'}
        </div>
        <table>
          <thead>
            <tr>
              <th>القسم المرجعي</th>
              <th>الشعب المرجعية</th>
              <th>موجودة في القاعدة</th>
            </tr>
          </thead>
          <tbody>
            {ref.map((d) => (
              <tr key={d.code}>
                <td>{d.nameAr}</td>
                <td>{d.subDepartments.map((s) => s.code).join('، ')}</td>
                <td>{d.subDepartments.filter((s) => dbCodes.has(s.code)).length}/{d.subDepartments.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!!drift.data?.missingInDb.length && <div className="warn">ناقص في القاعدة: {drift.data.missingInDb.join('، ')}</div>}
        {!!drift.data?.extraInDb.length && <div className="warn">زائد في القاعدة: {drift.data.extraInDb.join('، ')}</div>}
      </section>
    </div>
  );
}
