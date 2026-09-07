
### قسم الإنتاج (Production Department)

#### شعبة اليوريا — `PROD-UREA`

تشغيل وحدة اليوريا (غرفة السيطرة/الحبيبات/التعبئة) وسجلوبات الوردية وجودة المنتج النهائية.

| الدور | النطاق | الصلاحيات |
|---|---|---|
| رئيس الشعبة (SECTION_HEAD) | SUBDEPT | `auth.login` · `doc.upload` · `doc.view` · `fin.cost.view` · `hr.att.view` · `hr.leave.approve` · `hr.shift.view` · `lab.oos.manage` · `lab.report.export` · `lab.result.enter` · `lab.sample.create` · `maint.wo.create` · `maint.wo.view` · `notif.view` · `org.dept.view` · `prod.alarm.ack` · `prod.downtime.create` · `prod.downtime.view` · `prod.log.approve` · `prod.log.create` · `prod.log.update` · `prod.log.view` · `prod.param.create` · `prod.param.view` · `report.export` · `report.view` · `sync.pull` · `sync.push` · `wh.item.view` |
| مشرف الوردية (SHIFT_SUPERVISOR) | SUBDEPT | `auth.login` · `doc.upload` · `doc.view` · `hr.att.view` · `lab.sample.create` · `maint.wo.create` · `notif.view` · `org.dept.view` · `prod.alarm.ack` · `prod.downtime.create` · `prod.downtime.view` · `prod.log.create` · `prod.log.update` · `prod.log.view` · `prod.param.create` · `prod.param.view` · `sync.pull` · `sync.push` |
| مراقب سيطرة (CONTROL_ROOM_OPERATOR) | SUBDEPT | `auth.login` · `doc.upload` · `doc.view` · `hr.att.view` · `maint.wo.create` · `notif.view` · `org.dept.view` · `prod.alarm.ack` · `prod.downtime.create` · `prod.downtime.view` · `prod.log.create` · `prod.log.update` · `prod.log.view` · `prod.param.create` · `prod.param.view` · `sync.pull` · `sync.push` |
| فني صيانة (ميداني) (FIELD_TECHNICIAN) | SUBDEPT | `auth.login` · `doc.upload` · `doc.view` · `hr.att.view` · `hr.form.create` · `maint.asset.view` · `maint.condition.record` · `maint.permit.create` · `maint.permit.view` · `maint.wo.close` · `maint.wo.execute` · `maint.wo.view` · `notif.view` · `org.dept.view` · `prod.downtime.create` · `prod.log.view` · `prod.param.create` · `sync.pull` · `sync.push` · `wh.req.create` · `wh.return` |

#### شعبة الأمونيا — `PROD-AMM`

تشغيل وحدة الأمونيا (الإصلاح/التحويل/التخليق/الفصل) ومراقبة السمية والانحرافات.

| الدور | النطاق | الصلاحيات |
|---|---|---|
| رئيس الشعبة (SECTION_HEAD) | SUBDEPT | `auth.login` · `doc.upload` · `doc.view` · `fin.cost.view` · `hr.att.view` · `hr.leave.approve` · `hr.shift.view` · `lab.sample.create` · `maint.wo.create` · `maint.wo.view` · `notif.view` · `org.dept.view` · `prod.alarm.ack` · `prod.downtime.create` · `prod.downtime.view` · `prod.log.approve` · `prod.log.create` · `prod.log.update` · `prod.log.view` · `prod.param.create` · `prod.param.view` · `prod.utility.manage` · `report.export` · `report.view` · `sync.pull` · `sync.push` |
| مشرف الوردية (SHIFT_SUPERVISOR) | SUBDEPT | `auth.login` · `doc.upload` · `doc.view` · `hr.att.view` · `lab.sample.create` · `maint.wo.create` · `notif.view` · `org.dept.view` · `prod.alarm.ack` · `prod.downtime.create` · `prod.downtime.view` · `prod.log.create` · `prod.log.update` · `prod.log.view` · `prod.param.create` · `prod.param.view` · `sync.pull` · `sync.push` |
| مراقب سيطرة (CONTROL_ROOM_OPERATOR) | SUBDEPT | `auth.login` · `doc.upload` · `doc.view` · `hr.att.view` · `lab.sample.create` · `maint.wo.create` · `notif.view` · `org.dept.view` · `prod.alarm.ack` · `prod.downtime.create` · `prod.downtime.view` · `prod.log.create` · `prod.log.update` · `prod.log.view` · `prod.param.create` · `prod.param.view` · `sync.pull` · `sync.push` |

#### شعبة أبراج التبريد — `PROD-CT`

تشغيل أبراج التبريد: الخلايا والمراوح ومعالجة المياه (Cycles/BI) وتنظيف الحشوات.

| الدور | النطاق | الصلاحيات |
|---|---|---|
| رئيس الشعبة (SECTION_HEAD) | SUBDEPT | `auth.login` · `doc.upload` · `doc.view` · `fin.cost.view` · `hr.att.view` · `hr.leave.approve` · `hr.shift.view` · `lab.sample.create` · `maint.wo.create` · `maint.wo.view` · `notif.view` · `org.dept.view` · `prod.alarm.ack` · `prod.downtime.create` · `prod.downtime.view` · `prod.log.approve` · `prod.log.create` · `prod.log.update` · `prod.log.view` · `prod.param.create` · `prod.param.view` · `prod.utility.manage` · `report.export` · `report.view` · `sync.pull` · `sync.push` |
| مشرف الوردية (SHIFT_SUPERVISOR) | SUBDEPT | `auth.login` · `doc.upload` · `doc.view` · `hr.att.view` · `lab.sample.create` · `maint.wo.create` · `notif.view` · `org.dept.view` · `prod.alarm.ack` · `prod.downtime.create` · `prod.downtime.view` · `prod.log.create` · `prod.log.update` · `prod.log.view` · `prod.param.create` · `prod.param.view` · `prod.utility.manage` · `sync.pull` · `sync.push` |
| فني صيانة (ميداني) (FIELD_TECHNICIAN) | SUBDEPT | `auth.login` · `doc.upload` · `doc.view` · `hr.att.view` · `hr.form.create` · `maint.asset.view` · `maint.condition.record` · `maint.permit.create` · `maint.permit.view` · `maint.wo.close` · `maint.wo.execute` · `maint.wo.view` · `notif.view` · `org.dept.view` · `prod.downtime.create` · `prod.log.view` · `prod.param.create` · `prod.utility.manage` · `sync.pull` · `sync.push` · `wh.req.create` · `wh.return` |

#### المختبر — `PROD-LAB`

تحاليل العمليات والمنتج (NH3/Urea/Sub-mic/Boiler/CW)، شهادات التحليل، ومطابقة المواصفات.

| الدور | النطاق | الصلاحيات |
|---|---|---|
| رئيس الشعبة (SECTION_HEAD) | SUBDEPT | `auth.login` · `doc.upload` · `doc.view` · `hr.att.view` · `lab.oos.manage` · `lab.report.export` · `lab.result.enter` · `lab.result.verify` · `lab.sample.create` · `maint.wo.create` · `maint.wo.view` · `notif.view` · `org.dept.view` · `prod.downtime.view` · `prod.log.view` · `prod.param.view` · `report.export` · `report.view` · `sync.pull` · `sync.push` |
| مسؤول المختبر (LAB_SUPERVISOR) | SUBDEPT | `auth.login` · `doc.upload` · `doc.view` · `hr.att.view` · `lab.oos.manage` · `lab.report.export` · `lab.result.enter` · `lab.result.verify` · `lab.sample.create` · `notif.view` · `org.dept.view` · `prod.log.view` · `prod.param.view` · `sync.pull` · `sync.push` |
| محلل مختبر (LAB_ANALYST) | SUBDEPT | `auth.login` · `doc.upload` · `doc.view` · `hr.att.view` · `lab.oos.manage` · `lab.result.enter` · `lab.sample.create` · `notif.view` · `org.dept.view` · `prod.log.view` · `prod.param.view` · `sync.pull` · `sync.push` |


### قسم الصيانة (Maintenance Department)

#### شعبة المعدات الحرارية — `MAINT-HEAT`

المعدات الحرارية: المبادل الحراري، المفكك (Stripper)، أوعية الضغط، الفلنجات، اختبار التسرب، مواد حرارية.

| الدور | النطاق | الصلاحيات |
|---|---|---|
| رئيس الشعبة (SECTION_HEAD) | SUBDEPT | `auth.login` · `doc.upload` · `doc.view` · `hr.att.view` · `hr.emp.view` · `hr.form.view` · `hr.leave.approve` · `hr.shift.view` · `maint.asset.manage` · `maint.asset.view` · `maint.backlog.view` · `maint.condition.record` · `maint.condition.view` · `maint.downtime.verify` · `maint.permit.approve` · `maint.permit.create` · `maint.permit.view` · `maint.pm.manage` · `maint.wo.assign` · `maint.wo.cancel` · `maint.wo.close` · `maint.wo.create` · `maint.wo.execute` · `maint.wo.view` · `notif.view` · `org.dept.view` · `prod.downtime.view` · `prod.log.view` · `report.export` · `report.view` · `sync.pull` · `sync.push` · `wh.item.view` · `wh.req.approve` · `wh.req.create` · `wh.return` |
| فني صيانة (ميداني) (FIELD_TECHNICIAN) | SUBDEPT | `auth.login` · `doc.upload` · `doc.view` · `hr.att.view` · `hr.form.create` · `lab.result.enter` · `lab.sample.create` · `maint.asset.view` · `maint.condition.record` · `maint.permit.create` · `maint.permit.view` · `maint.wo.close` · `maint.wo.execute` · `maint.wo.view` · `notif.view` · `org.dept.view` · `prod.downtime.create` · `prod.log.view` · `sync.pull` · `sync.push` · `wh.req.create` · `wh.return` |
| مسؤول السلامة (HSE_OFFICER) | DEPT | `auth.login` · `doc.upload` · `doc.view` · `hr.att.view` · `maint.permit.approve` · `maint.permit.view` · `maint.wo.view` · `notif.view` · `org.dept.view` · `prod.log.view` · `sync.pull` · `sync.push` |

#### شعبة المعدات الدوارة — `MAINT-ROT`

المعدات الدوارة: الضواغط، المضخات، المراوح، تحليل الاهتزاز، المحاذاة بالليزر، التزييت.

| الدور | النطاق | الصلاحيات |
|---|---|---|
| رئيس الشعبة (SECTION_HEAD) | SUBDEPT | `auth.login` · `doc.upload` · `doc.view` · `hr.att.view` · `hr.emp.view` · `hr.form.view` · `hr.leave.approve` · `hr.shift.view` · `maint.asset.manage` · `maint.asset.view` · `maint.backlog.view` · `maint.condition.record` · `maint.condition.view` · `maint.downtime.verify` · `maint.permit.approve` · `maint.permit.create` · `maint.permit.view` · `maint.pm.manage` · `maint.wo.assign` · `maint.wo.cancel` · `maint.wo.close` · `maint.wo.create` · `maint.wo.execute` · `maint.wo.view` · `notif.view` · `org.dept.view` · `prod.downtime.view` · `prod.log.view` · `report.export` · `report.view` · `sync.pull` · `sync.push` · `wh.item.view` · `wh.req.approve` · `wh.req.create` · `wh.return` |
| فني صيانة (ميداني) (FIELD_TECHNICIAN) | SUBDEPT | `auth.login` · `doc.upload` · `doc.view` · `hr.att.view` · `hr.form.create` · `maint.asset.view` · `maint.condition.record` · `maint.permit.create` · `maint.permit.view` · `maint.wo.close` · `maint.wo.execute` · `maint.wo.view` · `notif.view` · `org.dept.view` · `prod.downtime.create` · `prod.log.view` · `sync.pull` · `sync.push` · `wh.req.create` · `wh.return` |

#### شعبة الكهرباء — `MAINT-ELEC`

الكهرباء: MV/LV، المحركات، لوحات التوزيع، الصيانة الوقائية للعزل، الأنظمة الكهروميكانيكية.

| الدور | النطاق | الصلاحيات |
|---|---|---|
| رئيس الشعبة (SECTION_HEAD) | SUBDEPT | `auth.login` · `doc.upload` · `doc.view` · `hr.att.view` · `hr.emp.view` · `hr.form.view` · `hr.leave.approve` · `hr.shift.view` · `maint.asset.manage` · `maint.asset.view` · `maint.backlog.view` · `maint.condition.record` · `maint.condition.view` · `maint.downtime.verify` · `maint.permit.approve` · `maint.permit.create` · `maint.permit.view` · `maint.pm.manage` · `maint.wo.assign` · `maint.wo.cancel` · `maint.wo.close` · `maint.wo.create` · `maint.wo.execute` · `maint.wo.view` · `notif.view` · `org.dept.view` · `prod.downtime.view` · `prod.log.view` · `report.export` · `report.view` · `sync.pull` · `sync.push` · `wh.item.view` · `wh.req.approve` · `wh.req.create` · `wh.return` |
| فني صيانة (ميداني) (FIELD_TECHNICIAN) | SUBDEPT | `auth.login` · `doc.upload` · `doc.view` · `hr.att.view` · `hr.form.create` · `maint.asset.view` · `maint.condition.record` · `maint.permit.approve` · `maint.permit.create` · `maint.permit.view` · `maint.wo.close` · `maint.wo.execute` · `maint.wo.view` · `notif.view` · `org.dept.view` · `prod.downtime.create` · `prod.log.view` · `sync.pull` · `sync.push` · `wh.req.create` · `wh.return` |

#### شعبة الصمامات — `MAINT-VALVE`

الصمامات: بنش تست لصمامات السلامة (PSV)، إصلاح الصمامات، سجل الصيانة والاختبارات، إعادة التركيب.

| الدور | النطاق | الصلاحيات |
|---|---|---|
| رئيس الشعبة (SECTION_HEAD) | SUBDEPT | `auth.login` · `doc.upload` · `doc.view` · `hr.att.view` · `hr.emp.view` · `hr.form.view` · `hr.leave.approve` · `hr.shift.view` · `maint.asset.manage` · `maint.asset.view` · `maint.backlog.view` · `maint.condition.record` · `maint.condition.view` · `maint.downtime.verify` · `maint.permit.approve` · `maint.permit.create` · `maint.permit.view` · `maint.pm.manage` · `maint.wo.assign` · `maint.wo.cancel` · `maint.wo.close` · `maint.wo.create` · `maint.wo.execute` · `maint.wo.view` · `notif.view` · `org.dept.view` · `prod.downtime.view` · `prod.log.view` · `report.export` · `report.view` · `sync.pull` · `sync.push` · `wh.item.view` · `wh.req.approve` · `wh.req.create` · `wh.return` |
| فني صيانة (ميداني) (FIELD_TECHNICIAN) | SUBDEPT | `auth.login` · `doc.upload` · `doc.view` · `hr.att.view` · `hr.form.create` · `maint.asset.view` · `maint.condition.record` · `maint.permit.create` · `maint.permit.view` · `maint.wo.close` · `maint.wo.execute` · `maint.wo.view` · `notif.view` · `org.dept.view` · `prod.downtime.create` · `prod.log.view` · `sync.pull` · `sync.push` · `wh.req.create` · `wh.return` |

#### شعبة الآلات الدقيقة — `MAINT-INST`

الآلات الدقيقة: أجهزة القياس، صمامات التحكم، أنظمة DCS/ESD/F&G، المحللات، عيارات (Calibration).

| الدور | النطاق | الصلاحيات |
|---|---|---|
| رئيس الشعبة (SECTION_HEAD) | SUBDEPT | `auth.login` · `doc.upload` · `doc.view` · `hr.att.view` · `hr.emp.view` · `hr.form.view` · `hr.leave.approve` · `hr.shift.view` · `maint.asset.manage` · `maint.asset.view` · `maint.backlog.view` · `maint.condition.record` · `maint.condition.view` · `maint.downtime.verify` · `maint.permit.approve` · `maint.permit.create` · `maint.permit.view` · `maint.pm.manage` · `maint.wo.assign` · `maint.wo.cancel` · `maint.wo.close` · `maint.wo.create` · `maint.wo.execute` · `maint.wo.view` · `notif.view` · `org.dept.view` · `prod.downtime.view` · `prod.log.view` · `report.export` · `report.view` · `sync.pull` · `sync.push` · `wh.item.view` · `wh.req.approve` · `wh.req.create` · `wh.return` |
| فني صيانة (ميداني) (FIELD_TECHNICIAN) | SUBDEPT | `auth.login` · `doc.upload` · `doc.view` · `hr.att.view` · `hr.form.create` · `maint.asset.view` · `maint.condition.record` · `maint.permit.create` · `maint.permit.view` · `maint.wo.close` · `maint.wo.execute` · `maint.wo.view` · `notif.view` · `org.dept.view` · `prod.downtime.create` · `prod.log.view` · `sync.pull` · `sync.push` · `wh.req.create` · `wh.return` |

#### شعبة المعدات العامة — `MAINT-GEN`

المعدات العامة: الأعمال المدنية، الهياكل، العزل الحراري والصباغة، الرافعات، الصيانة العامة للمبنى.

| الدور | النطاق | الصلاحيات |
|---|---|---|
| رئيس الشعبة (SECTION_HEAD) | SUBDEPT | `auth.login` · `doc.upload` · `doc.view` · `hr.att.view` · `hr.emp.view` · `hr.form.view` · `hr.leave.approve` · `hr.shift.view` · `maint.asset.manage` · `maint.asset.view` · `maint.backlog.view` · `maint.condition.record` · `maint.condition.view` · `maint.downtime.verify` · `maint.permit.approve` · `maint.permit.create` · `maint.permit.view` · `maint.pm.manage` · `maint.wo.assign` · `maint.wo.cancel` · `maint.wo.close` · `maint.wo.create` · `maint.wo.execute` · `maint.wo.view` · `notif.view` · `org.dept.view` · `prod.downtime.view` · `prod.log.view` · `report.export` · `report.view` · `sync.pull` · `sync.push` · `wh.item.view` · `wh.req.approve` · `wh.req.create` · `wh.return` |
| فني صيانة (ميداني) (FIELD_TECHNICIAN) | SUBDEPT | `auth.login` · `doc.upload` · `doc.view` · `hr.att.view` · `hr.form.create` · `maint.asset.view` · `maint.condition.record` · `maint.permit.create` · `maint.permit.view` · `maint.wo.close` · `maint.wo.execute` · `maint.wo.view` · `notif.view` · `org.dept.view` · `prod.downtime.create` · `prod.log.view` · `sync.pull` · `sync.push` · `wh.req.create` · `wh.return` |


### الأقسام الإدارية (Administrative Sections)

#### شعبة البصمة — `ADM-BIO`

البصمة والانضباط: سحب سجلات الأجهزة، معالجة النواقص، بطاقة الملاك، جهات التعريف، التصدير إلى الرواتب.

| الدور | النطاق | الصلاحيات |
|---|---|---|
| موظف الموارد البشرية (HR_OFFICER) | ALL | `auth.login` · `doc.upload` · `doc.view` · `hr.att.all` · `hr.att.correct` · `hr.att.export_payroll` · `hr.att.import` · `hr.att.view` · `hr.emp.view` · `hr.leave.approve` · `hr.shift.manage` · `hr.shift.view` · `notif.view` · `org.delegation.manage` · `org.dept.view` · `report.export` · `report.view` · `sync.pull` · `sync.push` |
| رئيس الشعبة (SECTION_HEAD) | SUBDEPT | `auth.login` · `doc.upload` · `doc.view` · `hr.att.correct` · `hr.att.view` · `hr.emp.view` · `hr.leave.approve` · `hr.shift.manage` · `hr.shift.view` · `notif.view` · `org.dept.view` · `prod.log.view` · `report.view` · `sync.pull` · `sync.push` |
| موظف الرواتب (PAYROLL_OFFICER) | ALL | `auth.login` · `doc.upload` · `doc.view` · `fin.payroll.view` · `hr.att.export_payroll` · `hr.att.view` · `hr.emp.view` · `notif.view` · `org.dept.view` · `report.export` · `report.view` · `sync.pull` · `sync.push` |
| مدير النظام (SYS_ADMIN) | ALL | `admin.system` · `auth.login` · `doc.upload` · `doc.view` · `hr.att.view` · `notif.view` · `org.dept.view` · `sync.pull` · `sync.push` |

#### الشعبة التجارية — `ADM-COM`

الشعبة التجارية: أوامر البيع/التحميل،与客户/وكلاء التوزيع، الكميات المسلّمة، الأسعار والعقود.

| الدور | النطاق | الصلاحيات |
|---|---|---|
| رئيس الشعبة (SECTION_HEAD) | SUBDEPT | `auth.login` · `com.customer.manage` · `com.order.confirm` · `com.order.create` · `com.order.view` · `com.pricing.manage` · `com.report.export` · `doc.manage` · `doc.upload` · `doc.view` · `fin.coa.view` · `fin.cost.view` · `fin.invoice.manage` · `hr.att.view` · `maint.wo.create` · `notif.view` · `org.dept.view` · `prod.downtime.view` · `prod.log.view` · `report.export` · `report.view` · `sync.pull` · `sync.push` |
| الموظف التجاري (COMMERCIAL_OFFICER) | DEPT | `auth.login` · `com.customer.manage` · `com.order.confirm` · `com.order.create` · `com.order.view` · `com.report.export` · `doc.upload` · `doc.view` · `hr.att.view` · `notif.view` · `org.dept.view` · `prod.log.view` · `report.view` · `sync.pull` · `sync.push` |

#### الشعبة المالية — `ADM-FIN`

الشعبة المالية: القيود والسندات، أوامر الشراء وسلطات التوقيع، الرواتب، التحصيل، الموازنة وتكاليف الصيانة.

| الدور | النطاق | الصلاحيات |
|---|---|---|
| رئيس الشعبة (SECTION_HEAD) | SUBDEPT | `audit.view` · `auth.login` · `doc.manage` · `doc.upload` · `doc.view` · `fin.ar_collect` · `fin.budget.manage` · `fin.budget.view` · `fin.coa.view` · `fin.cost.view` · `fin.grn_finance` · `fin.invoice.manage` · `fin.journal.manage` · `fin.payroll.run` · `fin.payroll.view` · `fin.po.approve` · `fin.po.view` · `fin.rate.manage` · `hr.att.export_payroll` · `hr.att.view` · `hr.emp.view` · `maint.backlog.view` · `notif.view` · `org.dept.view` · `prod.log.view` · `report.export` · `report.view` · `sync.pull` · `sync.push` |
| المدير المالي (FINANCE_MANAGER) | ALL | `audit.view` · `auth.login` · `doc.upload` · `doc.view` · `fin.ar_collect` · `fin.budget.manage` · `fin.coa.view` · `fin.cost.view` · `fin.grn_finance` · `fin.invoice.manage` · `fin.journal.manage` · `fin.payroll.run` · `fin.po.approve` · `fin.rate.manage` · `hr.att.view` · `notif.view` · `org.dept.view` · `report.export` · `report.view` · `sync.pull` · `sync.push` |
| محاسب (ACCOUNTANT) | ALL | `auth.login` · `doc.upload` · `doc.view` · `fin.ar_collect` · `fin.coa.view` · `fin.cost.view` · `fin.grn_finance` · `fin.invoice.manage` · `fin.journal.manage` · `fin.po.view` · `hr.att.view` · `notif.view` · `org.dept.view` · `report.export` · `report.view` · `sync.pull` · `sync.push` |
| مدقق (داخلي/خارجي) (AUDITOR) | ALL | `audit.export` · `audit.view` · `auth.login` · `doc.view` · `fin.coa.view` · `fin.cost.view` · `fin.journal.manage` · `fin.po.view` · `hr.att.view` · `notif.view` · `org.dept.view` · `report.export` · `report.view` · `sync.pull` |


### منح أفقية على مستوى المنشأة

| الدور | النطاق | الصلاحيات |
|---|---|---|
| مدير النظام (SYS_ADMIN) | ALL | `admin.system` · `audit.export` · `audit.view` · `auth.login` · `doc.manage` · `hr.emp.view` · `notif.view` · `org.dept.manage` · `org.dept.view` · `org.role.manage` · `org.user.manage` · `org.user.view` · `report.kpi.manage` · `sync.pull` |
| مدير المعمل/المشروع (PLANT_MANAGER) | ALL | `audit.view` · `com.order.view` · `doc.manage` · `fin.budget.view` · `fin.cost.view` · `fin.po.approve` · `hr.att.all` · `hr.leave.approve` · `hr.shift.view` · `lab.result.verify` · `maint.asset.view` · `maint.backlog.view` · `maint.permit.approve` · `maint.wo.assign` · `maint.wo.close` · `maint.wo.view` · `org.delegation.manage` · `prod.log.approve` · `report.export` · `report.kpi.manage` · `report.view` |
| رئيس القسم (DEPT_MANAGER) | DEPT | `audit.view` · `auth.login` · `com.order.confirm` · `doc.upload` · `doc.view` · `fin.budget.view` · `fin.cost.view` · `hr.att.correct` · `hr.form.view` · `hr.leave.approve` · `hr.shift.manage` · `maint.asset.manage` · `maint.backlog.view` · `maint.downtime.verify` · `maint.permit.approve` · `maint.pm.manage` · `maint.wo.assign` · `maint.wo.cancel` · `maint.wo.close` · `notif.view` · `org.dept.view` · `prod.downtime.view` · `prod.log.approve` · `prod.param.view` · `report.export` · `report.view` · `sync.pull` · `sync.push` · `wh.grn` · `wh.issue` · `wh.manage` · `wh.req.approve` · `wh.stocktake` |
| مسؤول السلامة (HSE_OFFICER) | ALL | `auth.login` · `doc.upload` · `lab.oos.manage` · `maint.permit.approve` · `maint.permit.view` · `maint.wo.view` · `notif.view` · `prod.downtime.view` · `report.view` · `sync.pull` · `sync.push` |
| مسؤول الوثائق (DOC_CONTROLLER) | ALL | `admin.system` · `auth.login` · `doc.manage` · `doc.upload` · `doc.view` · `notif.view` · `report.export` · `sync.pull` |
| مخطط صيانة (PLANNER) | DEPT | `auth.login` · `fin.cost.view` · `maint.backlog.view` · `maint.condition.view` · `maint.pm.manage` · `maint.wo.assign` · `maint.wo.view` · `notif.view` · `prod.downtime.view` · `report.export` · `report.view` · `sync.pull` · `sync.push` · `wh.item.view` · `wh.req.approve` |
| مستخدم عرض فقط (READONLY_GUEST) | DEPT | `auth.login` · `com.order.view` · `fin.budget.view` · `maint.backlog.view` · `maint.wo.view` · `notif.view` · `prod.log.view` · `prod.param.view` · `report.view` · `wh.item.view` |

### الصلاحيات المعرّفة غير الممنوحة (مراجعة)

- `hr.emp.manage` — إدارة بيانات الموظفين والعقود
- `hr.leave.view` — عرض طلبات الإجازات الخاصة
- `hr.leave.request` — تقديم طلب إجازة/مهمة/ساعات إضافية

### دليل رموز الوحدات (15)

- **admin**: 1 صلاحية
- **audit**: 2 صلاحية
- **auth**: 1 صلاحية
- **com**: 6 صلاحية
- **doc**: 3 صلاحية
- **fin**: 13 صلاحية
- **hr**: 11 صلاحية
- **lab**: 5 صلاحية
- **maint**: 16 صلاحية
- **notif**: 1 صلاحية
- **org**: 2 صلاحية
- **prod**: 10 صلاحية
- **report**: 2 صلاحية
- **sync**: 2 صلاحية
- **wh**: 4 صلاحية