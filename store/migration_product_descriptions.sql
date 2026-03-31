-- Migration: Add short_description and long_description columns to inventory
-- Run: wrangler d1 execute fpvgate-store-db --file=./migration_product_descriptions.sql --remote

ALTER TABLE inventory ADD COLUMN short_description TEXT;
ALTER TABLE inventory ADD COLUMN long_description TEXT;

-- Migrate existing description to short_description, set long_description for AIO V3
UPDATE inventory SET
    short_description = 'Premium all-in-one FPV lap timer. Novacore-powered, pre-flashed, plug and play. Just add power and fly.',
    long_description = '<h2>Product Details</h2>
<p>Meet the FPVGate AIO V3 - a purpose-built, all-in-one lap timer designed for pilots who want accurate timing without the hassle. No wiring harnesses, no firmware flashing, no hours spent troubleshooting pin mappings. The AIO V3 arrives ready to time your laps straight out of the box.</p>
<p>Traditional RSSI timers can be a frustrating experience. Loose wiring, unreliable connections, inconsistent readings, and DIY builds that take longer to assemble than the races themselves. When your timer misses a lap or gives you a false reading, it defeats the entire purpose of practicing.</p>
<p>The FPVGate AIO V3 is built to solve all of that:</p>
<ol>
<li><strong>Novacore Processor</strong> - High-resolution RSSI sampling delivers precise, consistent lap detection you can trust, whether you are flying analog or digital.</li>
<li><strong>True Plug and Play</strong> - Arrives pre-flashed with the latest FPVGate firmware. Connect power, set your frequency, and start flying. No setup guides, no serial flashing, no headaches.</li>
<li><strong>Built-in LEDs and Buzzer</strong> - Integrated RGB LEDs and buzzer give you instant visual and audio confirmation of every gate pass, with no extra components to wire up.</li>
<li><strong>Enhanced WiFi Antenna</strong> - Upgraded antenna design provides superior range, so you can control and monitor your timer from further away.</li>
<li><strong>Full FPVGate Software Suite</strong> - Voice announcements, lap comparison charts, race history, track profiles, multi-pilot sync, and RotorHazard integration, all included.</li>
<li><strong>Affordable Timing</strong> - Premium lap timing at a fraction of the cost of competing systems.</li>
</ol>'
WHERE product_id = 'fpvgate-aio-v3';
