import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

function fEur(n) {
  return (Math.round(n * 100) / 100).toFixed(2).replace('.', ',') + ' \u20ac';
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

  const pricingRows = `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">Peruspaketti (1–3 käyttäjää)</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap"><strong>${fEur(49)}/kk</strong></td>
    </tr>
    ${extraUsers > 0 ? `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">Lisäkäyttäjät (${extraUsers} × 19 €)</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap"><strong>${fEur(extraUsers * 19)}/kk</strong></td>
    </tr>` : ''}
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">Punnituslaput (${slipsN} × 0,50 €)</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap"><strong>${fEur(slipsN * 0.5)}/kk</strong></td>
    </tr>
    <tr style="background:#fffbf0">
      <td style="padding:10px 12px;font-size:16px"><strong>Yhteensä</strong></td>
      <td style="padding:10px 12px;text-align:right;white-space:nowrap"><strong style="font-size:18px;color:#111">${fEur(totalMonth)}/kk</strong></td>
    </tr>
    <tr>
      <td colspan="2" style="padding:4px 12px 12px;color:#888;font-size:12px">(${fEur(totalYear)}/vuosi)</td>
    </tr>`;

  const roiSection = roi > 0 ? `
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px">
    <tr><td colspan="2" style="padding:14px 12px 8px;background:#f8f8f8">
      <strong style="color:#7a5000;font-size:13px;letter-spacing:1px;text-transform:uppercase">Laskennallinen säästö</strong>
    </td></tr>
    <tr>
      <td style="padding:8px 12px;color:#555;font-size:13px" colspan="2">
        ${slipsN} lapulla × 6 min = <strong>${Math.round(hoursMonth)} tuntia/kk</strong> käsittelyaikaa.
        Tuntihinnalla 50 €/h se on <strong>${fEur(savings)}/kk</strong>.
      </td>
    </tr>
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">Työaikakustannus/kk</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap"><strong>${fEur(savings)}</strong></td>
    </tr>
    <tr>
      <td style="padding:8px 12px;border-bottom:2px solid #1a6e1a">Kasamasterin hinta/kk</td>
      <td style="padding:8px 12px;border-bottom:2px solid #1a6e1a;text-align:right;white-space:nowrap"><strong>${fEur(totalMonth)}</strong></td>
    </tr>
    <tr style="background:#f0fff4">
      <td style="padding:10px 12px"><strong style="color:#1a6e1a">Nettosäästö</strong></td>
      <td style="padding:10px 12px;text-align:right;white-space:nowrap">
        <strong style="color:#1a6e1a;font-size:18px">${fEur(roi)}/kk</strong>
      </td>
    </tr>
    <tr>
      <td colspan="2" style="padding:4px 12px 12px;color:#1a6e1a;font-size:12px">(${fEur(roi * 12)}/vuosi)</td>
    </tr>
  </table>
  <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.7">
    Kasamaster ei ole pelkkä kustannus — se maksaa itsensä takaisin laskennallisesti joka kuukausi.
  </p>` : `
  <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.7">
    Vaikka suora tuntisäästö on tässä volyymissa pieni, Kasamaster vapauttaa sinut paperisodasta
    ja antaa enemmän aikaa sille mikä oikeasti tuottaa.
  </p>`;

  const benefits = [
    ['Punnituslaput digitaaliseen arkistoon', 'Kuski kuvaa lapun heti kentällä — järjestelmä tunnistaa painon ja materiaalin automaattisesti. Lappu on tallessa pilvessä ja löytyy vuosienkin päästä hakunappia painamalla. Ei enää kadotettuja lappuja, ei mappeja.'],
    ['Laskutus nopeutuu merkittävästi', 'Kaikki kuormat kertyvät automaattisesti asiakkaan alle. Kun laskutusaika tulee, valitset asiakkaan ja lähetät laskun parilla klikkauksella liitteineen. Ei enää käsin laskemista tai viivästyneitä laskuja.'],
    ['Kuskit hoitavat oman osuutensa', 'Kuljettajat kirjaavat kuormat itse puhelimella suoraan kentältä. Toimistoon saapuu valmis data — ei soittoja, ei tekstareita. Jokainen kuorma on jäljitettävissä tilaukseen ja laskuun asti.'],
    ['Varasto pysyy ajan tasalla', 'Varastosaldot päivittyvät automaattisesti jokaisen kuorman myötä. Näet reaaliajassa mitä on jäljellä — ennen kuin asiakas soittaa ja tilaa materiaalia jota ei ole.'],
    ['Stressi vähenee — tieto on aina saatavilla', 'Reklamaatio? Löydät kuormakirjan kuvineen sekunnissa. Kirjanpitäjä tarvitsee erittelyt? PDF tulostuu nappia painamalla. Ei enää etsimistä, ei arvailua.'],
    ['Hinta skaalautuu teidän mukaanne', 'Hiljainen kuukausi maksaa vähemmän, kiireinen enemmän — automaattisesti. Ette maksa kiinteää kuukausimaksua toiminnasta jota ette käytä.'],
  ];

  const benefitsHTML = benefits.map(([title, text], i) => `
    <tr>
      <td style="padding:16px 0;border-bottom:1px solid #f0f0f0;vertical-align:top">
        <div style="font-weight:700;font-size:14px;color:#111;margin-bottom:6px">${i+1}. ${title}</div>
        <div style="font-size:13px;color:#555;line-height:1.7">${text}</div>
      </td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="fi">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f2f2f2;font-family:Arial,sans-serif;-webkit-font-smoothing:antialiased">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f2;padding:24px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08)">

  <!-- Header -->
  <tr><td style="background:#111;padding:20px 28px;border-bottom:4px solid #FFC107">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-size:28px;font-weight:900;letter-spacing:4px;color:#FFC107">KASA<span style="color:#C8C8C8">MASTER</span></td>
      <td align="right" style="vertical-align:middle">
        <div style="font-size:11px;font-weight:700;letter-spacing:3px;color:#fff;text-transform:uppercase">Tarjous</div>
        <div style="font-size:11px;color:#aaa;margin-top:2px">${today}</div>
        <div style="font-size:11px;color:#FFC107">Voimassa 30 päivää</div>
      </td>
    </tr></table>
  </td></tr>

  <!-- Intro -->
  <tr><td style="padding:28px 28px 0">
    <p style="margin:0 0 12px;font-size:15px">Hei <strong>${company}</strong>,</p>
    <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.7">
      Kiitos kiinnostuksestanne Kasamasteria kohtaan! Alla on räätälöity tarjous
      <strong>${slipsN} punnituslapun</strong> kuukausittaiseen volyymiin ja
      <strong>${usersN} käyttäjään</strong> perustuen.
    </p>
  </td></tr>

  <!-- Pricing -->
  <tr><td style="padding:0 28px 24px">
    <div style="font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#7a5000;margin-bottom:8px">Hinnoittelu</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #eee;border-radius:6px;overflow:hidden">
      ${pricingRows}
    </table>
  </td></tr>

  <!-- ROI -->
  <tr><td style="padding:0 28px 8px">
    <div style="font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#7a5000;margin-bottom:8px">
      ${roi > 0 ? 'Laskennallinen säästö' : 'Miksi Kasamaster kannattaa?'}
    </div>
    ${roiSection}
  </td></tr>

  <!-- Benefits -->
  <tr><td style="padding:0 28px 24px">
    <div style="font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#7a5000;margin-bottom:8px">Mitä Kasamaster käytännössä tekee</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${benefitsHTML}
    </table>
  </td></tr>

  <!-- Getting started -->
  <tr><td style="padding:0 28px 28px">
    <div style="font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#7a5000;margin-bottom:12px">Aloittaminen</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f8f8f8;border-radius:6px">
      <tr><td style="padding:10px 14px;border-bottom:1px solid #eee;font-size:13px">✓ &nbsp;30 päivän ilmainen kokeilu — ei sitoumusta</td></tr>
      <tr><td style="padding:10px 14px;border-bottom:1px solid #eee;font-size:13px">✓ &nbsp;Käyttöönotto alle 15 minuutissa</td></tr>
      <tr><td style="padding:10px 14px;font-size:13px">✓ &nbsp;Ensimmäinen kuukausi ilman punnituslappumaksua</td></tr>
    </table>
    <p style="margin:20px 0 0;font-size:13px;color:#555;line-height:1.7">
      Otamme teihin yhteyttä puhelimitse (<strong>${phone}</strong>) sopiaksemme lyhyen esittelyn.
      Käyttöönotto vie alle 15 minuuttia.
    </p>
  </td></tr>

  <!-- CTA button -->
  <tr><td style="padding:0 28px 28px;text-align:center">
    <a href="https://app.kasamaster.fi" style="display:inline-block;background:#FFC107;color:#000;font-weight:700;font-size:16px;letter-spacing:2px;padding:14px 40px;border-radius:8px;text-decoration:none;text-transform:uppercase">
      ALOITA ILMAINEN KOKEILU →
    </a>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#111;padding:14px 28px;border-top:2px solid #FFC107">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-size:14px;font-weight:900;letter-spacing:2px;color:#FFC107">KASAMASTER</td>
      <td align="right" style="font-size:11px;color:#666">Adepta Oy · Y-tunnus 2237131-2 · info@kasamaster.fi</td>
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
  const html = buildQuoteHTML({ company, phone: phone || '', email, slips, users, today });

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
      html: `<p style="font-family:Arial;padding:16px;background:#fff3cd;border:1px solid #FFC107;border-radius:6px;margin-bottom:24px">
        <strong>Kopio:</strong> Tarjous lähetetty asiakkaalle <strong>${company}</strong> (${email})
      </p>${html}`,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
