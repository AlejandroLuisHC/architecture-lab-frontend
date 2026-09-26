import type { WorkloadAssumptions } from '../../types';

const controls: Array<{
    key: keyof WorkloadAssumptions;
    label: string;
    min: number;
    max: number;
    step: number;
}> = [
    { key: 'requestsPerMonth', label: 'Requests per month', min: 0, max: 1_000_000_000_000, step: 1 },
    { key: 'averageDurationMs', label: 'Average duration (ms)', min: 0, max: 900_000, step: 1 },
    { key: 'storageGb', label: 'Stored data (GB)', min: 0, max: 10_000_000, step: 1 },
    { key: 'availabilityTarget', label: 'Availability target (%)', min: 90, max: 99.999, step: 0.001 },
];

export default function WorkloadEditor({
    value,
    disabled,
    onChange,
}: {
    value: WorkloadAssumptions;
    disabled: boolean;
    onChange: (value: WorkloadAssumptions) => void;
}) {
    return (
        <section className="sandbox-workload" aria-labelledby="workload-title">
            <div>
                <span className="eyebrow">WORKLOAD & SERVICE TARGETS</span>
                <h2 id="workload-title">Set your assumptions</h2>
                <p>These inputs shape indicative performance and cost estimates.</p>
            </div>
            <div className="workload-fields">
                {controls.map((control) => (
                    <label key={control.key}>
                        <span>{control.label}</span>
                        <input
                            aria-label={control.label}
                            type="number"
                            min={control.min}
                            max={control.max}
                            step={control.step}
                            disabled={disabled}
                            value={value[control.key]}
                            onChange={(event) =>
                                onChange({ ...value, [control.key]: Number(event.target.value) })
                            }
                        />
                    </label>
                ))}
            </div>
        </section>
    );
}
