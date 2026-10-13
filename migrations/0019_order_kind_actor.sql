ALTER TABLE orders ADD COLUMN kind TEXT;
ALTER TABLE orders ADD COLUMN created_by TEXT;
ALTER TABLE orders ADD COLUMN po_number TEXT;

UPDATE orders
SET kind = 'sell_stock'
WHERE IFNULL(TRIM(kind), '') = ''
  AND (status = 'Received' OR logistics = 'ATN wholesale');

UPDATE orders
SET kind = 'order_sims'
WHERE IFNULL(TRIM(kind), '') = '';
