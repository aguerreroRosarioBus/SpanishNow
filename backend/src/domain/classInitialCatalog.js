// Datos iniciales de SPEC §3. Importación explícita; nunca se asigna a docentes nuevos ni habilita ventas.
const variants = [
  ['individual-1x30', 1, 30, 1500, 1],
  ['individual-1x50', 1, 50, 2500, 1],
  ['individual-4x30', 4, 30, 5000, 1],
  ['individual-4x50', 4, 50, 9000, 1],
  ['group2-1x50-total', 1, 50, 3000, 2],
  ['group3-1x50-seat', 1, 50, 1500, 3]
];
module.exports = variants.map(([templateKey, sessionsCount, minutesPerSession, priceAmount, groupSize]) => ({
  templateKey, sessionsCount, minutesPerSession, priceAmount, groupSize,
  nameEn: groupSize === 1 ? `${sessionsCount} × ${minutesPerSession} min — individual` : `Group of ${groupSize} — ${minutesPerSession} min`,
  nameEs: groupSize === 1 ? `${sessionsCount} × ${minutesPerSession} min — individual` : `Grupo de ${groupSize} — ${minutesPerSession} min`,
  descriptionEn: '', descriptionEs: '', currency: 'USD', validityHours: sessionsCount === 4 ? 2160 : 720,
  modality: groupSize === 1 ? 'individual' : 'group',
  billing: groupSize === 1 ? 'per_buyer' : groupSize === 2 ? 'per_group' : 'per_seat',
  seatsCovered: groupSize === 2 ? 2 : 1,
  expectations: null, hotmartProductId: null, hotmartOfferCode: null, hotmartCheckoutUrl: null
}));
