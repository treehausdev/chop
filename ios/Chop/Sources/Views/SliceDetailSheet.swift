import SwiftUI

/// Detail sheet for a selected slice — shows timing info and play button
struct SliceDetailSheet: View {
    let sample: Sample
    let onPlay: () -> Void
    let onReset: () -> Void
    
    var body: some View {
        VStack(spacing: 20) {
            // Drag indicator
            Capsule()
                .fill(Color.white.opacity(0.3))
                .frame(width: 36, height: 4)
                .padding(.top, 8)
            
            HStack {
                Text("Slice \(sample.id + 1)")
                    .font(.title3)
                    .fontWeight(.bold)
                    .foregroundStyle(.white)
                
                Spacer()
                
                Button(action: onPlay) {
                    Image(systemName: "play.circle.fill")
                        .font(.system(size: 40))
                        .foregroundStyle(.orange)
                }
            }
            
            // Timing info
            VStack(spacing: 12) {
                TimingRow(label: "Start", value: formatTime(sample.startTime))
                TimingRow(label: "End", value: formatTime(sample.endTime))
                TimingRow(label: "Duration", value: formatTime(sample.duration))
            }
            .padding(16)
            .background(Color.white.opacity(0.06))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            
            Button(action: onReset) {
                Label("Reset All Slices", systemImage: "arrow.counterclockwise")
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundStyle(.gray)
                    .padding(.vertical, 10)
                    .frame(maxWidth: .infinity)
                    .background(Color.white.opacity(0.06))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            
            Spacer()
        }
        .padding(.horizontal, 20)
        .presentationDetents([.height(280)])
        .presentationBackground(Color(white: 0.1))
        .presentationDragIndicator(.hidden)
    }
    
    private func formatTime(_ t: TimeInterval) -> String {
        let ms = Int((t.truncatingRemainder(dividingBy: 1)) * 1000)
        let s = Int(t) % 60
        let m = Int(t) / 60
        return String(format: "%d:%02d.%03d", m, s, ms)
    }
}

struct TimingRow: View {
    let label: String
    let value: String
    
    var body: some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(.gray)
            Spacer()
            Text(value)
                .font(.system(.subheadline, design: .monospaced))
                .foregroundStyle(.white)
        }
    }
}
