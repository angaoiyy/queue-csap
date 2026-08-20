alter table display_settings
  add column if not exists marquee_text text not null default 'Please proceed to your assigned counter when your number is called';
