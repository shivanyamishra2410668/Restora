-- Optional development seed. Inserts plan catalog only; no users, passwords or fake orders.
insert into public.subscription_plans(name,price,billing_period,features,active) values
('Free',0,'monthly','["Restaurant workspace","Menu and order basics"]',true),
('Basic',29,'monthly','["Operational reports","Inventory tools"]',true),
('Premium',79,'monthly','["Advanced analytics","Priority support"]',true)
on conflict(name) do nothing;
