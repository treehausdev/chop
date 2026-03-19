import SwiftUI

struct PadGrid: View {
    let samples: [Sample]
    let activePadIndex: Int?
    let onTap: (Sample) -> Void
    
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 8), count: 4)
    
    var body: some View {
        LazyVGrid(columns: columns, spacing: 8) {
            ForEach(samples) { sample in
                PadButton(
                    index: sample.id,
                    isActive: activePadIndex == sample.id,
                    onTap: { onTap(sample) }
                )
            }
        }
        .aspectRatio(1, contentMode: .fit)
    }
}

struct PadButton: View {
    let index: Int
    let isActive: Bool
    let onTap: () -> Void
    
    // Pad colors — each row gets a shade
    private var padColor: Color {
        let row = index / 4
        switch row {
        case 0: return .orange
        case 1: return .red
        case 2: return .purple
        case 3: return .blue
        default: return .gray
        }
    }
    
    var body: some View {
        Button(action: onTap) {
            RoundedRectangle(cornerRadius: 8)
                .fill(isActive ? padColor : padColor.opacity(0.3))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .strokeBorder(padColor.opacity(0.6), lineWidth: 1)
                )
                .overlay(
                    Text("\(index + 1)")
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundStyle(.white.opacity(0.5))
                )
                .shadow(color: isActive ? padColor.opacity(0.6) : .clear, radius: 8)
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.impact(flexibility: .rigid, intensity: 0.6), trigger: isActive)
    }
}
