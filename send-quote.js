import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

function fEur(n) {
  return (Math.round(n * 100) / 100).toFixed(2).replace('.', ',') + ' €';
}

function buildQuoteHTML(data) {
  const { company, phone, email, slips, users, today } = data;
  const slipsN = parseInt(slips) || 0;
  const usersN = parseInt(users) || 0;
  const extraUsers = Math.max(0, usersN - 3);
  const totalMonth = 49 + extraUsers * 19 + slipsN * 0.50;
  const totalYear = totalMonth * 12;
  const hoursMonth = slipsN * 6 / 60;
  const savings = hoursMonth * 50;
  const roi = savings - totalMonth;

  const roiSection = roi > 0 ? `
    <tr><td colspan="2" style="padding:16px 0 4px"><strong style="color:#996600">LASKENNALLINEN SÄÄSTÖ</strong></td></tr>
    <tr><td colspan="2" style="padding-bottom:8px;color:#555;font-size:13px">
      ${slips} lapulla (6 min/kpl) = ${Math.round(hoursMonth)} h/kk × 50 €/h
    </td></tr>
    <tr><td>Työaikakustannus</td><td align="right"><strong>${fEur(savings)}/kk</strong></td></tr>
    <tr><td>Kasamasterin hinta</td><td align="right"><strong>${fEur(totalMonth)}/kk</strong></td></tr>
    <tr style="border-top:2px solid #1a6e1a">
      <td><strong style="color:#1a6e1a">Nettosäästö</strong></td>
      <td align="right"><strong style="color:#1a6e1a;font-size:16px">${fEur(roi)}/kk</strong></td>
    </tr>
    <tr><td colspan="2" style="padding-top:4px;color:#1a6e1a;font-size:13px">
      (${fEur(roi * 12)}/vuosi)
    </td></tr>
  ` : `
    <tr><td colspan="2" style="padding:16px 0 4px"><strong style="color:#996600">MIKSI KASAMASTER?</strong></td></tr>
    <tr><td colspan="2" style="color:#555;font-size:13px;line-height:1.6">
      Vaikka suora tuntisäästö on pieni, Kasamaster poistaa paperisota,
      nopeuttaa laskutuksen ja antaa mielenrauhan — tieto on aina tallessa.
    </td></tr>
  `;

  return `<!DOCTYPE html>
<html lang="fi">
<head><meta charset="utf-8"><title>Kasamaster-tarjous</title></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:24px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden">

  <!-- Header -->
  <tr><td style="background:#111;padding:20px 28px">
    <table width="100%"><tr>
      <td style="font-family:Arial,sans-serif;font-size:28px;font-weight:bold;letter-spacing:4px;color:#FFC107">KASAMASTER</td>
      <td align="right" style="color:#fff;font-size:13px">
        <div style="font-weight:bold;letter-spacing:2px">TARJOUS</div>
        <div style="color:#aaa;font-size:11px;margin-top:3px">${today}</div>
        <div style="color:#FFC107;font-size:11px">Voimassa 30 päivää</div>
      </td>
    </tr></table>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:24px 28px">
    <p style="margin:0 0 16px">Hei <strong>${company}</strong>,</p>
    <p style="margin:0 0 24px;color:#555">Kiitos yhteydenotostanne! Alla on räätälöity tarjous tietojenne perusteella.</p>

    <table width="100%" cellpadding="6" cellspacing="0" style="font-size:14px;border-collapse:collapse">
      <tr style="background:#f8f8f8"><td colspan="2" style="padding:10px 8px"><strong style="color:#996600">HINNOITTELU</strong></td></tr>
      <tr><td>Peruspaketti (1–3 käyttäjää)</td><td align="right"><strong>${fEur(49)}/kk</strong></td></tr>
      ${extraUsers > 0 ? `<tr><td>Lisäkäyttäjät (${extraUsers} × 19 €)</td><td align="right"><strong>${fEur(extraUsers * 19)}/kk</strong></td></tr>` : ''}
      <tr><td>Punnituslaput (${slips} × 0,50 €)</td><td align="right"><strong>${fEur(slipsN * 0.5)}/kk</strong></td></tr>
      <tr style="border-top:2px solid #FFC107;background:#fffbf0">
        <td><strong>Yhteensä</strong></td>
        <td align="right"><strong style="font-size:18px">${fEur(totalMonth)}/kk</strong></td>
      </tr>
      <tr><td colspan="2" style="color:#888;font-size:12px">(${fEur(totalYear)}/vuosi)</td></tr>

      ${roiSection}
    </table>

    <table width="100%" cellpadding="6" cellspacing="0" style="font-size:14px;border-collapse:collapse;margin-top:20px">
      <tr style="background:#f8f8f8"><td colspan="2" style="padding:10px 8px"><strong style="color:#996600">ALOITTAMINEN</strong></td></tr>
      <tr><td>✓ 30 päivän ilmainen kokeilu</td><td></td></tr>
      <tr><td>✓ Käyttöönotto alle 15 minuutissa</td><td></td></tr>
      <tr><td>✓ Ensimmäinen kuukausi ilman punnituslappumaksua</td><td></td></tr>
    </table>

    <p style="margin:24px 0 8px;color:#555;font-size:13px">
      Otamme teihin yhteyttä puhelimitse (${phone}) sopiaksemme lyhyen esittelyn.
    </p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#111;padding:12px 28px">
    <table width="100%"><tr>
      <td style="color:#FFC107;font-weight:bold;letter-spacing:2px;font-size:13px">KASAMASTER</td>
      <td align="right" style="color:#666;font-size:11px">Adepta Oy · Y-tunnus 2237131-2 · info@kasamaster.fi</td>
    </tr></table>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { company, phone, email, slips, users } = req.body;

  if (!company || !email || !slips || !users) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const today = new Date().toLocaleDateString('fi-FI');
  const html = buildQuoteHTML({ company, phone, email, slips, users, today });

  try {
    // Send to customer
    await resend.emails.send({
      from: 'Kasamaster <info@kasamaster.fi>',
      to: email,
      subject: `Kasamaster-tarjous — ${company}`,
      html,
    });

    // Send copy to Jukka
    await resend.emails.send({
      from: 'Kasamaster <info@kasamaster.fi>',
      to: 'jukka.taskinen@adepta.fi',
      subject: `Asiakkaalle lähetetty tarjous - ${company}`,
      html: `<p>Asiakkaalle <strong>${company}</strong> (${email}) lähetetty tarjous.</p><hr>${html}`,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
