import { createFusanex } from '../adapter/in/createFusanex';

async function main() {
  const fx = createFusanex();

  const result = await fx.rate('USDT', 'KRW');
  console.log('`rate`: USDT/KRW =', result);

  const result2 = await fx.directRate('USDT', 'KRW')
  console.log('`direct-rate`: USDT/KRW =', result2);

  const result3 = await fx.crossRate('USDT', 'KRW');
  console.log('`cross-rate`: USDT/KRW =', result3);

  const result4 = await fx.fiatRate('USD', 'KRW');
  console.log('`fiat-rate`: USD/KRW =', result4);
}

main();