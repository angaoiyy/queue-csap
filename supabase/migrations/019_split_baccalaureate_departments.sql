-- Split the single "Baccalaureate-College" department into its real colleges
delete from departments where label = 'Baccalaureate-College';

insert into departments (label, requires_degree_program, sort_order)
select label, true, sort_order
from (values
  ('CTE — College of Teacher Education', 0),
  ('CBEIS — College of Business Education and Information Systems', 1),
  ('CAS — College of Arts and Sciences', 2),
  ('CCJE — College of Criminal Justice Education', 3),
  ('CONM — College of Nursing and Midwifery', 4),
  ('COE — College of Engineering', 5)
) as t(label, sort_order)
where not exists (select 1 from departments where label = t.label);

update departments set sort_order = 6 where label = 'Senior HighSchool';

alter table degree_programs add column if not exists department_id uuid references departments(id);

update degree_programs set department_id = (select id from departments where label = 'CTE — College of Teacher Education')
where label in (
  'Bachelor of Elementary Education (BEEd)',
  'Bachelor of Physical Education (BPEd)',
  'Bachelor of Secondary Education (BSEd)',
  'Bachelor of Special Needs Education',
  'Diploma in Professional Education'
);

update degree_programs set department_id = (select id from departments where label = 'CBEIS — College of Business Education and Information Systems')
where label in (
  'Bachelor of Science in Accounting Information System (BSAIS)',
  'Bachelor of Science in Information System (BSIS)',
  'Bachelor of Science in Office Administration (BSOAd)',
  'Bachelor of Science in Tourism Management (BSTM)'
);

update degree_programs set department_id = (select id from departments where label = 'CAS — College of Arts and Sciences')
where label in (
  'Bachelor of Science in Psychology'
);

update degree_programs set department_id = (select id from departments where label = 'CCJE — College of Criminal Justice Education')
where label in (
  'Bachelor of Science in Criminology (BSCrim)'
);

update degree_programs set department_id = (select id from departments where label = 'CONM — College of Nursing and Midwifery')
where label in (
  'Bachelor of Science in Nursing (BSN)'
);

update degree_programs set department_id = (select id from departments where label = 'COE — College of Engineering')
where label in (
  'Bachelor of Science in Civil Engineering (BSCE)',
  'Bachelor of Science in Computer Engineering (BSCpE)',
  'Bachelor of Science in Electrical Engineering (BSEE)',
  'Bachelor of Science in Mechanical Engineering (BSME)'
);
