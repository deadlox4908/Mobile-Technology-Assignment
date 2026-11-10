// Campus Carpool — Expo / React Native version
// Features: 4-step booking, live info for the selected trip, live transport schedule,
// booking history (this session only). Calm teal-and-off-white card design.
// Uses React Native core components plus react-native-safe-area-context (built into Expo Go;
// Snack adds it to package.json automatically) so the bars clear the notch and Android's system buttons.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  StatusBar,
  StyleSheet,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

// ---------------------------------------------------------------- trip data
const TRIPS = [
  { name: '🚆 Campus → KL Sentral', info: 'Daily Commute, 5.30 pm', fare: 8, cap: 4, km: 25, dep: 17 * 60 + 30, dur: 40, weekend: false },
  { name: '🏙️ Campus → Subang Jaya', info: 'Daily Commute, 5.30 pm', fare: 4, cap: 3, km: 15, dep: 17 * 60 + 30, dur: 25, weekend: false },
  { name: '🏫 Subang Jaya → Campus', info: 'Daily Commute, 7.30 am', fare: 4, cap: 3, km: 15, dep: 7 * 60 + 30, dur: 25, weekend: false },
  { name: '✈️ Campus → KLIA', info: 'Airport Transfer, 9.00 am', fare: 20, cap: 4, km: 60, dep: 9 * 60, dur: 60, weekend: false },
  { name: '🛍️ Campus → Sunway Pyramid', info: 'Weekend Trip, 10.00 am', fare: 6, cap: 4, km: 15, dep: 10 * 60, dur: 25, weekend: true },
  { name: '🛕 Campus → Batu Caves', info: 'Weekend Trip, 9.30 am', fare: 9, cap: 3, km: 30, dep: 9 * 60 + 30, dur: 45, weekend: true },
];
const PICKUPS = ['Main Gate', 'Library', 'Student Hostel', 'Cafeteria', 'Car Park B'];
const LUGGAGE = ['Hand-carry only', 'With luggage'];
const STEPS = ['Trips', 'Booking', 'Total', 'Details'];

// Calm palette: soft neutrals, one muted teal accent, strong colour only where it means something.
const C = {
  ink: '#1E2A28', // main text (soft charcoal)
  primary: '#2F6F62', // buttons, selected step, the + button
  deep: '#1F3D37', // dark cards: live trip, total, receipt, header
  page: '#F6F7F4', // warm off-white background
  card: '#FFFFFF',
  chip: '#E3EFEB', // secondary buttons, chips, selected rows
  muted: '#5E6C68', // small grey text on light backgrounds
  soft: '#4A5753', // secondary text
  onDeepMuted: '#A9C2BB', // small text on dark cards
  onDeep: '#DCE8E4', // body text on dark cards
  err: '#C0392B', // errors only
};

// Status colours: each live status gets its own tint, so it can be read at a glance.
const TONES = {
  onTime: { bg: '#E1ECF6', fg: '#2D5F8F' }, // calm blue
  soon: { bg: '#FBF0D9', fg: '#8A5A00' }, // amber: boarding soon
  now: { bg: '#DFF1E5', fg: '#24734A' }, // green: boarding now
  enRoute: { bg: '#E3EFEB', fg: '#2F6F62' }, // teal
  done: { bg: '#ECEEEC', fg: '#5E6C68' }, // grey
  off: { bg: '#ECEEEC', fg: '#5E6C68' }, // grey: weekend only
};

// ---------------------------------------------------------------- formatting helpers
// Written by hand so they look the same on Android, iOS and web.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad2 = (n) => String(n).padStart(2, '0');
const money = (n) => 'RM' + n.toFixed(2);
function timeText(d, withSeconds) {
  const h = d.getHours() % 12 || 12;
  const ampm = d.getHours() < 12 ? 'AM' : 'PM';
  return `${h}:${pad2(d.getMinutes())}${withSeconds ? ':' + pad2(d.getSeconds()) : ''} ${ampm}`;
}
const dateText = (d) => `${DAYS[d.getDay()]}, ${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
const stampText = (d) => `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${timeText(d, false)}`;
const fmtMins = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`);

// ---------------------------------------------------------------- live status
// Works out where a trip is right now, from the phone's clock.
function tripStatus(trip, now) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const day = now.getDay(); // 0 = Sunday ... 6 = Saturday
  const isWeekend = day === 0 || day === 6;
  const diff = trip.dep - nowMin; // minutes until today's departure (negative = already left)

  let status, tone;
  if (trip.weekend && !isWeekend) [status, tone] = ['Weekend service only (Sat & Sun)', 'off'];
  else if (diff > 15) [status, tone] = [`On schedule · departs in ${fmtMins(diff)}`, 'onTime'];
  else if (diff > 5) [status, tone] = [`Boarding soon · departs in ${diff} min`, 'soon'];
  else if (diff >= 0) [status, tone] = [`Boarding now · departs in ${diff} min`, 'now'];
  else if (diff + trip.dur > 0) [status, tone] = [`En route · arrives in ${fmtMins(diff + trip.dur)}`, 'enRoute'];
  else [status, tone] = ['Completed for today', 'done'];

  let next;
  if (trip.weekend && !isWeekend) next = `Saturday, in ${6 - day} day(s)`;
  else if (diff >= 0) next = `Today, in ${fmtMins(diff)}`;
  else if (trip.weekend && day === 0) next = 'Next Saturday, in 6 days';
  else next = `Tomorrow, in ${fmtMins(diff + 1440)}`;

  return { status, tone, next };
}

// ---------------------------------------------------------------- small UI pieces
// kind: 'primary' (teal, main action) | 'chip' (soft, secondary) | 'danger' (soft red, removes something)
function Btn({ title, onPress, kind = 'primary', style, bold }) {
  const bg = { primary: C.primary, chip: C.chip, danger: '#FBEDEB' }[kind];
  const fg = { primary: '#FFFFFF', chip: C.ink, danger: C.err }[kind];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.btn, { backgroundColor: bg, opacity: pressed ? 0.75 : 1 }, style]}>
      <Text style={[styles.btnText, { color: fg }, bold && { fontWeight: '700' }]}>{title}</Text>
    </Pressable>
  );
}

function Chip({ label, on, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function ListCard({ text, selected, onPress, children }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.listCard, selected && styles.listCardSel]}>
      <Text style={styles.listText}>{text}</Text>
      {children}
    </Pressable>
  );
}

// Coloured pill for a live status (blue on schedule, amber soon, green now, teal en route, grey done)
function StatusPill({ tone, text }) {
  const t = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <View style={[styles.pillDot, { backgroundColor: t.fg }]} />
      <Text style={[styles.pillText, { color: t.fg }]}>{text}</Text>
    </View>
  );
}

const Title = ({ children }) => <Text style={styles.h3}>{children}</Text>;

// ---------------------------------------------------------------- receipt ticket
// One label/value line, label on the left, value on the right.
function Row({ label, value, valueStyle }) {
  return (
    <View style={styles.rRow}>
      <Text style={styles.rLabel}>{label}</Text>
      <Text style={[styles.rValue, valueStyle]}>{value}</Text>
    </View>
  );
}

// Dashed "tear here" line with a half-circle notch on each side, like a paper ticket.
function TearLine() {
  return (
    <View style={styles.tear}>
      <View style={[styles.notch, { left: -11 }]} />
      <View style={styles.dashes}>
        {Array.from({ length: 30 }).map((_, k) => (
          <View key={k} style={styles.dash} />
        ))}
      </View>
      <View style={[styles.notch, { right: -11 }]} />
    </View>
  );
}

// One figure in the History summary card.
function Stat({ value, label }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Text>
    </View>
  );
}

// The booking as a ticket: trips, passenger details, price breakdown, total.
// Used on the Confirm page and in History.
function ReceiptView({ r }) {
  return (
    <View style={styles.ticket}>
      <View style={styles.tSection}>
        <Text style={styles.tKicker}>{r.trips.length > 1 ? 'YOUR TRIPS' : 'YOUR TRIP'}</Text>
        {r.trips.map((t) => (
          <View key={t.name} style={styles.tTrip}>
            <View style={styles.flex1}>
              <Text style={styles.tTripName}>{t.name}</Text>
              <Text style={styles.tTripInfo}>{t.info}</Text>
            </View>
            <Text style={styles.tTripPrice}>
              {t.seats} × {money(t.fare)}
            </Text>
          </View>
        ))}
      </View>

      <TearLine />
      <View style={styles.tSection}>
        <Row label="Passenger" value={r.name} />
        <Row label="Pickup point" value={r.pickup} />
        <Row label="Luggage" value={r.luggage} />
        <Row label="Seats" value={String(r.seats)} />
        <Row label="Booked on" value={r.stamp} />
      </View>

      <TearLine />
      <View style={styles.tSection}>
        <Row label="Fare subtotal" value={money(r.fare)} />
        {r.discount > 0 && (
          <Row label="Student discount (10%)" value={`−${money(r.discount)}`} valueStyle={{ color: TONES.now.fg }} />
        )}
        <Row label={`Booking fee (${r.seats} × RM0.50)`} value={money(r.fee)} />
      </View>

      <View style={styles.tTotal}>
        <Text style={styles.tTotalLabel}>TOTAL FARE</Text>
        <Text style={styles.tTotalValue}>{money(r.total)}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- app
export default function App() {
  return (
    <SafeAreaProvider>
      <CarpoolApp />
    </SafeAreaProvider>
  );
}

function CarpoolApp() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const toTop = () => scrollRef.current?.scrollTo({ y: 0, animated: false });
  const [page, setPage] = useState('welcome'); // welcome | main | confirm | sched | hist
  const [step, setStep] = useState(1);
  const [booking, setBooking] = useState([]); // [{ trip: index, seats: n }]
  const [selTrip, setSelTrip] = useState(null); // index into TRIPS
  const [selBook, setSelBook] = useState(null); // index into booking
  const [removeArmed, setRemoveArmed] = useState(false);
  const [student, setStudent] = useState(true);
  const [name, setName] = useState('');
  const [pickup, setPickup] = useState(null);
  const [luggage, setLuggage] = useState(null);
  const [message, setMessage] = useState('');
  const [bookingNo, setBookingNo] = useState(1);
  const [receipt, setReceipt] = useState(null); // the last confirmed booking (see confirm)
  const [history, setHistory] = useState([]); // confirmed receipts, oldest first
  const [histSel, setHistSel] = useState(null); // booking number of the ticket that is open
  const [clearArmed, setClearArmed] = useState(false); // Clear history needs a second tap
  const [now, setNow] = useState(new Date());

  // Clock: ticks every second, like App Inventor's Clock1.Timer
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const booked = (i) => booking.find((b) => b.trip === i)?.seats ?? 0;
  const seatsLeft = (i) => TRIPS[i].cap - booked(i);

  const totals = useMemo(() => {
    let seats = 0, fare = 0, co2 = 0;
    const lines = booking.map((b) => {
      const t = TRIPS[b.trip];
      seats += b.seats;
      fare += t.fare * b.seats;
      co2 += t.km * 0.1575 * b.seats;
      return `${t.name}  |  ${money(t.fare)} x ${b.seats} seats = ${money(t.fare * b.seats)}`;
    });
    const discount = student ? fare * 0.1 : 0;
    const fee = 0.5 * seats;
    return { seats, fare, co2, discount, fee, total: fare - discount + fee, lines };
  }, [booking, student]);

  // ---------------- navigation
  const show = (p) => {
    setPage(p);
    if (p === 'hist') setHistSel(null); // History always opens with every ticket closed
    setClearArmed(false);
    toTop();
  };
  const goStep = (n) => {
    if (n > 1 && booking.length === 0) return setMessage('Please book at least one trip first.');
    setStep(n);
    setMessage('');
    toTop();
  };

  // ---------------- booking actions
  const bookSeat = () => {
    if (selTrip === null) return setMessage('Select a trip first.');
    const t = TRIPS[selTrip];
    if (seatsLeft(selTrip) <= 0) return setMessage(`${t.name} is full. No more seats available.`);
    const pos = booking.findIndex((b) => b.trip === selTrip);
    if (pos < 0) {
      setBooking([...booking, { trip: selTrip, seats: 1 }]);
      setMessage(`${t.name} added to your booking.`);
    } else {
      setBooking(booking.map((b, k) => (k === pos ? { ...b, seats: b.seats + 1 } : b)));
      setMessage(`Seat added on ${t.name}`);
    }
  };
  const plusSeat = () => {
    if (selBook === null) return setMessage('Select a booked trip first.');
    const b = booking[selBook];
    if (seatsLeft(b.trip) <= 0) return setMessage(`Only ${TRIPS[b.trip].cap} seats are available on this trip.`);
    setBooking(booking.map((x, k) => (k === selBook ? { ...x, seats: x.seats + 1 } : x)));
    setMessage('');
  };
  const minusSeat = () => {
    if (selBook === null) return setMessage('Select a booked trip first.');
    if (booking[selBook].seats <= 1) return setMessage('Minimum is 1 seat. Use Remove to delete the trip.');
    setBooking(booking.map((x, k) => (k === selBook ? { ...x, seats: x.seats - 1 } : x)));
    setMessage('');
  };
  const removeTrip = () => {
    if (selBook === null) return setMessage('Select a booked trip first.');
    if (!removeArmed) {
      setRemoveArmed(true);
      return setMessage('Remove this trip? Tap Remove again to confirm.');
    }
    setBooking(booking.filter((_, k) => k !== selBook));
    setSelBook(null);
    setRemoveArmed(false);
    setMessage('Trip removed from your booking.');
  };

  const resetBooking = () => {
    setBooking([]);
    setSelTrip(null);
    setSelBook(null);
    setRemoveArmed(false);
    setName('');
    setPickup(null);
    setLuggage(null);
    setStudent(true);
    setMessage('');
    setStep(1);
  };

  const confirm = () => {
    const n = name.trim();
    if (booking.length === 0) return setMessage('Please book at least one trip before confirming.');
    if (n.length < 2) return setMessage('Please enter your name (at least 2 characters).');
    if (n.length > 30) return setMessage('Name must be 30 characters or fewer.');
    if (pickup === null) return setMessage('Please choose a pickup point.');
    if (luggage === null) return setMessage('Please choose a luggage option.');
    const T = totals;
    const stamp = stampText(new Date());
    const r = {
      no: bookingNo,
      name: n,
      pickup: PICKUPS[pickup],
      luggage: LUGGAGE[luggage],
      stamp,
      trips: booking.map((b) => ({ name: TRIPS[b.trip].name, info: TRIPS[b.trip].info, seats: b.seats, fare: TRIPS[b.trip].fare })),
      seats: T.seats,
      fare: T.fare,
      discount: T.discount,
      fee: T.fee,
      total: T.total,
      co2: T.co2,
    };
    setReceipt(r);
    setHistory([...history, r]);
    setBookingNo(bookingNo + 1);
    resetBooking(); // so the same booking can't be confirmed twice
    show('confirm'); // also scrolls to the top so the "Booking confirmed!" header is in view
  };

  // ---------------- pages
  const renderWelcome = () => (
    <View style={[styles.card, styles.welcome]}>
      <Text style={{ fontSize: 60 }}>🚗</Text>
      <Text style={styles.brand}>Campus Carpool</Text>
      <Text style={styles.tag}>Welcome! Share the ride, save the fare.</Text>
      <Btn title="Begin Booking" bold onPress={() => show('main')} style={{ alignSelf: 'stretch' }} />
      <Text style={styles.note}>Your booking is kept temporarily for this session only.</Text>
    </View>
  );

  const renderTripCard = () => {
    if (selTrip === null) {
      return (
        <View style={styles.darkCard}>
          <Text style={styles.darkHead}>NEXT DEPARTURE</Text>
          <Text style={styles.darkBig}>Pick a trip</Text>
          <Text style={styles.darkDetail}>Tap a trip above to see live times, status and seats left.</Text>
        </View>
      );
    }
    const t = TRIPS[selTrip];
    const { status, tone, next } = tripStatus(t, now);
    return (
      <View style={styles.darkCard}>
        <Text style={styles.darkHead}>NEXT DEPARTURE  ·  LIVE {timeText(now, true)}</Text>
        <Text style={styles.darkBig}>{next}</Text>
        <Text style={styles.darkDetail}>
          {t.name}
          {'\n'}
          {t.info}
        </Text>
        <StatusPill tone={tone} text={status} />
        <Text style={styles.darkDetail}>Seats left: {seatsLeft(selTrip)}</Text>
      </View>
    );
  };

  const renderStep = () => {
    if (step === 1) {
      return (
        <>
          <Title>Available Trips</Title>
          {TRIPS.map((t, i) => (
            <ListCard
              key={t.name}
              selected={selTrip === i}
              onPress={() => setSelTrip(i)}
              text={`${t.name}\n${t.info}  ·  ${money(t.fare)} per seat  ·  Seats left: ${seatsLeft(i)}`}
            />
          ))}
          {renderTripCard()}
          <Btn title="Book Seat" onPress={bookSeat} />
        </>
      );
    }
    if (step === 2) {
      return (
        <>
          <Title>Your Booking</Title>
          {booking.length === 0 && <Text style={styles.note}>No trips booked yet.</Text>}
          {totals.lines.map((line, k) => (
            <ListCard
              key={booking[k].trip}
              text={line}
              selected={selBook === k}
              onPress={() => {
                setSelBook(k);
                setRemoveArmed(false);
              }}
            />
          ))}
          <View style={styles.row}>
            <Btn title="–  seat" kind="chip" onPress={minusSeat} style={styles.flex1} />
            <Btn title="+  seat" kind="chip" onPress={plusSeat} style={styles.flex1} />
            <Btn title="Remove trip" kind="danger" bold onPress={removeTrip} style={styles.flex1} />
          </View>
        </>
      );
    }
    if (step === 3) {
      const T = totals;
      return (
        <>
          <Title>Booking Total</Title>
          <View style={styles.card}>
            <Text style={styles.line}>Number of seats: {T.seats}</Text>
            <Text style={styles.line}>Fare subtotal: {money(T.fare)}</Text>
            <Pressable style={styles.checkRow} onPress={() => setStudent(!student)} accessibilityRole="checkbox" accessibilityState={{ checked: student }}>
              <View style={[styles.checkBox, student && { backgroundColor: C.primary }]}>
                {student && <Text style={styles.checkMark}>✓</Text>}
              </View>
              <Text style={styles.checkLabel}>I am a student (10% discount)</Text>
            </Pressable>
            <Text style={styles.line}>Student discount (10%): -{money(T.discount)}</Text>
            <Text style={styles.line}>Booking fee (RM0.50 x {T.seats} seats): {money(T.fee)}</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>FINAL TOTAL</Text>
            <Text style={styles.totalValue}>{money(T.total)}</Text>
          </View>
          <Text style={styles.line}>🌱 Eco-Impact: about {T.co2.toFixed(1)} kg CO2 saved by sharing</Text>
        </>
      );
    }
    return (
      <>
        <Title>Passenger Information</Title>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Passenger name (2-30 letters)"
          placeholderTextColor={C.muted}
          maxLength={40}
          returnKeyType="done"
          style={styles.input}
        />
        <Text style={styles.label}>Pickup point</Text>
        <View style={styles.chipWrap}>
          {PICKUPS.map((p, k) => (
            <Chip key={p} label={p} on={pickup === k} onPress={() => setPickup(k)} />
          ))}
        </View>
        <Text style={styles.label}>Luggage</Text>
        <View style={styles.chipWrap}>
          {LUGGAGE.map((p, k) => (
            <Chip key={p} label={p} on={luggage === k} onPress={() => setLuggage(k)} />
          ))}
        </View>
        <Text style={styles.note}>🔒 No passwords, ID numbers, home address, card details or live location are collected.</Text>
        <Btn title="Confirm Booking" bold onPress={confirm} />
      </>
    );
  };

  const renderMain = () => (
    <View style={styles.page}>
      <View style={styles.stepBar}>
        {STEPS.map((s, k) => (
          <Pressable key={s} onPress={() => goStep(k + 1)} style={[styles.stepPill, step === k + 1 && styles.stepPillOn]}>
            <Text style={[styles.stepText, step === k + 1 && styles.stepTextOn]}>
              {k + 1}  {s}
            </Text>
          </Pressable>
        ))}
      </View>
      {renderStep()}
      {/* Messages sit right under the step's main button (Book Seat, the seat buttons, Confirm),
          so they show up where the user just tapped instead of at the top of a scrolled page. */}
      {!!message && <Text style={styles.msg}>{message}</Text>}
      <View style={[styles.row, { marginTop: 6 }]}>
        {step > 1 && <Btn title="←  Back" kind="chip" onPress={() => goStep(step - 1)} style={styles.flex1} />}
        {step < 4 && <Btn title="Next  →" bold onPress={() => goStep(step + 1)} style={styles.flex1} />}
      </View>
    </View>
  );

  const renderConfirm = () =>
    receipt && (
      <View style={styles.page}>
        <View style={styles.successHead}>
          <View style={styles.successIcon}>
            <Text style={styles.successTick}>✓</Text>
          </View>
          <Text style={styles.successTitle}>Booking confirmed!</Text>
          <Text style={styles.successSub}>Thanks, {receipt.name}. Your seat is reserved.</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Booking #{receipt.no}</Text>
          </View>
        </View>

        <ReceiptView r={receipt} />

        <View style={styles.ecoChip}>
          <Text style={styles.ecoText}>🌱 You saved about {receipt.co2.toFixed(1)} kg of CO₂ by sharing this ride</Text>
        </View>

        <Btn
          title="Start New Booking"
          bold
          onPress={() => {
            resetBooking();
            show('welcome');
          }}
        />
        <Btn title="View booking history" kind="chip" onPress={() => show('hist')} />
      </View>
    );

  const renderSchedule = () => (
    <View style={styles.page}>
      <Title>Live Transport Schedule</Title>
      <Text style={styles.clock}>{timeText(now, true)}</Text>
      <Text style={styles.clockDate}>● LIVE  ·  {dateText(now)}</Text>
      {TRIPS.map((t, i) => {
        const { status, tone } = tripStatus(t, now);
        return (
          <ListCard key={t.name} text={`${t.name}\n${t.info}`}>
            <StatusPill tone={tone} text={status} />
            <Text style={styles.seatsText}>Seats left: {seatsLeft(i)}</Text>
          </ListCard>
        );
      })}
      <Text style={styles.note}>
        Status updates live from the phone's clock: boarding, en route or completed. Seats left update as bookings are made.
      </Text>
    </View>
  );

  const renderHistory = () => {
    if (history.length === 0) {
      return (
        <View style={styles.page}>
          <Title>Booking History</Title>
          <View style={[styles.card, styles.empty]}>
            <Text style={{ fontSize: 44 }}>🧾</Text>
            <Text style={styles.emptyTitle}>No bookings yet</Text>
            <Text style={styles.emptySub}>Your confirmed trips from this session will show up here.</Text>
            <Btn title="Book a ride" bold onPress={() => show('main')} style={{ alignSelf: 'stretch' }} />
          </View>
        </View>
      );
    }
    const spent = history.reduce((s, r) => s + r.total, 0);
    const saved = history.reduce((s, r) => s + r.co2, 0);
    const clearHistory = () => {
      if (!clearArmed) return setClearArmed(true);
      setHistory([]);
      setHistSel(null);
      setClearArmed(false);
    };
    return (
      <View style={styles.page}>
        <Title>Booking History</Title>

        {/* summary of this session */}
        <View style={styles.statCard}>
          <Stat value={String(history.length)} label={history.length === 1 ? 'booking' : 'bookings'} />
          <View style={styles.statDivider} />
          <Stat value={money(spent)} label="total fares" />
          <View style={styles.statDivider} />
          <Stat value={`${saved.toFixed(1)} kg`} label="CO₂ saved" />
        </View>
        <Text style={styles.note}>Newest first. Tap a booking to open its ticket.</Text>

        {[...history].reverse().map((r) => {
          const open = histSel === r.no;
          const more = r.trips.length - 1;
          return (
            <View key={r.no} style={styles.histGroup}>
              <Pressable
                onPress={() => {
                  setHistSel(open ? null : r.no);
                  setClearArmed(false); // doing anything else cancels a half-done Clear history
                }}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                style={[styles.histItem, open && styles.histItemOpen]}>
                <View style={styles.histNo}>
                  <Text style={styles.histNoText} numberOfLines={1}>
                    #{r.no}
                  </Text>
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.histTrip} numberOfLines={1}>
                    {r.trips[0].name}
                  </Text>
                  {more > 0 && (
                    <Text style={styles.histMore}>
                      +{more} more {more === 1 ? 'trip' : 'trips'}
                    </Text>
                  )}
                  <Text style={styles.histMeta}>
                    {r.stamp}  ·  {r.seats} {r.seats === 1 ? 'seat' : 'seats'}
                  </Text>
                </View>
                <View style={styles.histRight}>
                  <Text style={styles.histTotal}>{money(r.total)}</Text>
                  <Text style={styles.histChevron}>{open ? 'Hide ▴' : 'View ▾'}</Text>
                </View>
              </Pressable>
              {open && <ReceiptView r={r} />}
            </View>
          );
        })}

        <Btn title={clearArmed ? 'Tap again to clear all bookings' : 'Clear history'} kind="danger" bold onPress={clearHistory} />
        <Text style={styles.note}>History is kept for this session only and is cleared when the app closes.</Text>
      </View>
    );
  };

  const pages = { welcome: renderWelcome, main: renderMain, confirm: renderConfirm, sched: renderSchedule, hist: renderHistory };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.deep} />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.hi}>Hey there 👋</Text>
        <Text style={styles.headline}>Where are we riding today?</Text>
      </View>

      {/* Android in SDK 54 is edge-to-edge, so the window no longer resizes for the keyboard:
          pad on both platforms so Confirm Booking stays reachable while typing. */}
      <KeyboardAvoidingView style={styles.flex1} behavior="padding">
        <ScrollView
          ref={scrollRef}
          style={styles.content}
          contentContainerStyle={styles.contentInner}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
          {pages[page]()}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* White bar extends under Android's system buttons / the iPhone home indicator */}
      <View style={[styles.navBar, { height: 72 + insets.bottom, paddingBottom: insets.bottom }]}>
        <Pressable style={styles.navItem} onPress={() => show('sched')}>
          <Text style={[styles.navText, page === 'sched' && styles.navTextOn]}>◷  Live</Text>
        </Pressable>
        <Pressable style={styles.navPlus} onPress={() => show('main')} accessibilityLabel="Book">
          <Text style={styles.navPlusText}>＋</Text>
        </Pressable>
        <Pressable style={styles.navItem} onPress={() => show('hist')}>
          <Text style={[styles.navText, page === 'hist' && styles.navTextOn]}>☰  History</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- styles
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.page },
  header: { backgroundColor: C.deep, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 18 },
  hi: { color: C.onDeepMuted, fontSize: 13 },
  headline: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginTop: 2 },

  content: { flex: 1, backgroundColor: C.page },
  contentInner: { padding: 14, paddingBottom: 24 },
  page: { gap: 10 },

  card: { backgroundColor: C.card, borderRadius: 18, padding: 14, gap: 6 },
  welcome: { alignItems: 'center', paddingVertical: 32, gap: 12 },
  brand: { fontSize: 32, fontWeight: '900', color: C.ink },
  tag: { fontSize: 16, color: C.soft, textAlign: 'center' },

  h3: { fontSize: 18, fontWeight: '700', color: C.ink, marginTop: 4 },
  note: { fontSize: 12.5, color: C.muted, lineHeight: 18 },
  line: { fontSize: 15, color: C.soft },
  label: { fontSize: 13, fontWeight: '700', color: C.ink, marginTop: 4 },
  msg: { color: C.err, fontWeight: '700', fontSize: 14 },

  listCard: { backgroundColor: C.card, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, gap: 8, borderWidth: 1.5, borderColor: C.card },
  listCardSel: { backgroundColor: C.chip, borderColor: C.primary },
  listText: { fontSize: 14, color: C.ink, lineHeight: 20 },
  seatsText: { fontSize: 13, color: C.muted },

  pill: { alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontSize: 13, fontWeight: '700', flexShrink: 1 }, // wraps inside the pill on small screens / large text

  btn: { borderRadius: 999, paddingVertical: 13, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 14, fontWeight: '500' },
  row: { flexDirection: 'row', gap: 6 },
  flex1: { flex: 1 },

  stepBar: { flexDirection: 'row', gap: 6 },
  stepPill: { flex: 1, backgroundColor: C.chip, borderRadius: 999, paddingVertical: 9, alignItems: 'center' },
  stepPillOn: { backgroundColor: C.primary },
  stepText: { fontSize: 12, fontWeight: '700', color: C.muted },
  stepTextOn: { color: '#FFFFFF' },

  // rounded deep-teal cards (live trip info, total, receipt)
  darkCard: { backgroundColor: C.deep, borderRadius: 22, paddingVertical: 16, paddingHorizontal: 18, gap: 6 },
  darkHead: { color: C.onDeepMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  darkBig: { color: '#FFFFFF', fontSize: 26, fontWeight: '700' },
  darkDetail: { color: C.onDeep, fontSize: 14, lineHeight: 21 },

  // confirmation page
  successHead: { alignItems: 'center', gap: 6, paddingVertical: 8 },
  successIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: TONES.now.bg, alignItems: 'center', justifyContent: 'center' },
  successTick: { fontSize: 32, fontWeight: '900', color: TONES.now.fg },
  successTitle: { fontSize: 24, fontWeight: '700', color: C.ink },
  successSub: { fontSize: 15, color: C.soft, textAlign: 'center' },
  badge: { backgroundColor: C.chip, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14, marginTop: 4 },
  badgeText: { fontSize: 13, fontWeight: '700', color: C.primary },
  ecoChip: { backgroundColor: C.chip, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14 },
  ecoText: { fontSize: 14, fontWeight: '600', color: C.primary, lineHeight: 20 },

  // receipt ticket
  ticket: { backgroundColor: C.card, borderRadius: 22, overflow: 'hidden' },
  tSection: { paddingHorizontal: 18, paddingVertical: 14, gap: 10 },
  tKicker: { fontSize: 12, fontWeight: '700', color: C.muted, letterSpacing: 0.8 },
  tTrip: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tTripName: { fontSize: 15, fontWeight: '700', color: C.ink },
  tTripInfo: { fontSize: 13, color: C.muted, marginTop: 2 },
  tTripPrice: { fontSize: 14, fontWeight: '700', color: C.ink },
  rRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  // label takes the free space and wraps at word breaks; the value keeps its width (up to 60%),
  // so amounts never split across lines and long names wrap inside the value column
  rLabel: { flex: 1, fontSize: 14, color: C.muted },
  rValue: { flexShrink: 0, maxWidth: '60%', fontSize: 14, fontWeight: '600', color: C.ink, textAlign: 'right' },
  tear: { height: 22, justifyContent: 'center' },
  notch: { position: 'absolute', top: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: C.page },
  dashes: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 18, overflow: 'hidden' },
  dash: { width: 6, height: 1.5, borderRadius: 1, backgroundColor: '#C9D6D2' },
  tTotal: { backgroundColor: C.deep, flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 18 },
  tTotalLabel: { color: C.onDeepMuted, fontSize: 13, fontWeight: '700', letterSpacing: 0.5, flexShrink: 1 },
  tTotalValue: { color: '#FFFFFF', fontSize: 26, fontWeight: '700' },

  totalCard: { backgroundColor: C.deep, borderRadius: 22, paddingVertical: 14, paddingHorizontal: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { color: C.onDeepMuted, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  totalValue: { color: '#FFFFFF', fontSize: 24, fontWeight: '700' },

  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  checkMark: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  checkLabel: { fontSize: 15, color: C.ink },

  input: { backgroundColor: C.chip, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.ink },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: C.chip, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14 },
  chipOn: { backgroundColor: C.primary },
  chipText: { fontSize: 13, color: C.ink, fontWeight: '500' },
  chipTextOn: { color: '#FFFFFF' },

  clock: { fontSize: 44, fontWeight: '700', color: C.ink, textAlign: 'center', marginTop: 4 },
  clockDate: { fontSize: 13, color: C.muted, textAlign: 'center', marginBottom: 4 },

  // history page
  empty: { alignItems: 'center', gap: 10, paddingVertical: 28 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.ink },
  emptySub: { fontSize: 14, color: C.soft, textAlign: 'center', lineHeight: 20 },
  statCard: { backgroundColor: C.deep, borderRadius: 22, flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 8 },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 4 },
  statValue: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  statLabel: { color: C.onDeepMuted, fontSize: 12, fontWeight: '600' },
  statDivider: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.15)' },
  histGroup: { gap: 8 },
  histItem: { backgroundColor: C.card, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1.5, borderColor: C.card },
  histItemOpen: { borderColor: C.primary },
  // circle that grows into a pill for #10 and up or with large text
  histNo: { minWidth: 44, minHeight: 44, paddingHorizontal: 8, borderRadius: 22, backgroundColor: C.chip, alignItems: 'center', justifyContent: 'center' },
  histNoText: { fontSize: 13, fontWeight: '700', color: C.primary },
  histTrip: { fontSize: 15, fontWeight: '700', color: C.ink },
  histMore: { fontSize: 13, fontWeight: '700', color: C.primary, marginTop: 2 },
  histMeta: { fontSize: 13, color: C.muted, marginTop: 2 },
  histRight: { alignItems: 'flex-end', gap: 2 },
  histTotal: { fontSize: 15, fontWeight: '700', color: C.ink },
  histChevron: { fontSize: 12, fontWeight: '700', color: C.primary },

  navBar: { height: 72, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 10 },
  navItem: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' },
  navText: { fontSize: 13, fontWeight: '700', color: C.muted },
  navTextOn: { color: C.primary },
  navPlus: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  navPlusText: { color: '#FFFFFF', fontSize: 26, lineHeight: 30 },
});
