import SwiftUI

/// Full-track waveform with slice boundaries, tap-to-select, and draggable handles
struct WaveformView: View {
    let waveformData: [Float]
    let samples: [Sample]
    let totalDuration: TimeInterval
    let playingSampleId: Int?
    let selectedSliceIndex: Int?
    let onSelectSlice: (Int) -> Void
    let onBoundaryDrag: (Int, TimeInterval) -> Void
    
    @State private var draggedBoundaryIndex: Int?
    
    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            
            ZStack(alignment: .leading) {
                // Background
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.white.opacity(0.04))
                
                // Slice region fills
                ForEach(samples) { sample in
                    let x1 = xPosition(for: sample.startTime, in: w)
                    let x2 = xPosition(for: sample.endTime, in: w)
                    let isPlaying = playingSampleId == sample.id
                    let isSelected = selectedSliceIndex == sample.id
                    
                    Rectangle()
                        .fill(
                            isPlaying
                                ? LinearGradient(
                                    colors: [Color.orange.opacity(0.35), Color.orange.opacity(0.15)],
                                    startPoint: .bottom, endPoint: .top)
                                : isSelected
                                    ? LinearGradient(
                                        colors: [Color.orange.opacity(0.2), Color.orange.opacity(0.08)],
                                        startPoint: .bottom, endPoint: .top)
                                    : LinearGradient(
                                        colors: [Color.clear, Color.clear],
                                        startPoint: .bottom, endPoint: .top)
                        )
                        .frame(width: max(0, x2 - x1))
                        .offset(x: x1)
                        .allowsHitTesting(true)
                        .onTapGesture {
                            onSelectSlice(sample.id)
                        }
                }
                
                // Waveform shape
                WaveformShape(data: waveformData)
                    .fill(
                        LinearGradient(
                            colors: [Color.orange.opacity(0.8), Color.orange.opacity(0.3)],
                            startPoint: .top, endPoint: .bottom
                        )
                    )
                    .allowsHitTesting(false)
                
                // Waveform line on top
                WaveformLineShape(data: waveformData)
                    .stroke(Color.orange, lineWidth: 1)
                    .allowsHitTesting(false)
                
                // Slice boundary lines
                ForEach(sliceBoundaryTimes.indices, id: \.self) { idx in
                    let time = sliceBoundaryTimes[idx]
                    let x = xPosition(for: time, in: w)
                    let isEdge = idx == 0 || idx == sliceBoundaryTimes.count - 1
                    
                    if !isEdge {
                        // Draggable handle zone
                        Rectangle()
                            .fill(Color.clear)
                            .frame(width: 28, height: h)
                            .contentShape(Rectangle())
                            .position(x: x, y: h / 2)
                            .gesture(
                                DragGesture(minimumDistance: 1)
                                    .onChanged { value in
                                        draggedBoundaryIndex = idx
                                        let newTime = timePosition(for: value.location.x, in: w)
                                        onBoundaryDrag(idx, newTime)
                                    }
                                    .onEnded { _ in
                                        draggedBoundaryIndex = nil
                                    }
                            )
                        
                        // Visual line
                        Rectangle()
                            .fill(draggedBoundaryIndex == idx ? Color.orange : Color.white.opacity(0.25))
                            .frame(width: draggedBoundaryIndex == idx ? 2 : 1)
                            .position(x: x, y: h / 2)
                            .allowsHitTesting(false)
                        
                        // Handle dot
                        if selectedSliceIndex != nil {
                            Circle()
                                .fill(Color.orange)
                                .frame(width: 8, height: 8)
                                .position(x: x, y: h - 4)
                                .allowsHitTesting(false)
                        }
                    }
                }
            }
        }
        .frame(height: 100)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
    
    // MARK: - Helpers
    
    private var sliceBoundaryTimes: [TimeInterval] {
        guard !samples.isEmpty else { return [] }
        var times: [TimeInterval] = [samples[0].startTime]
        for sample in samples {
            times.append(sample.endTime)
        }
        return times
    }
    
    private func xPosition(for time: TimeInterval, in width: CGFloat) -> CGFloat {
        guard totalDuration > 0 else { return 0 }
        return CGFloat(time / totalDuration) * width
    }
    
    private func timePosition(for x: CGFloat, in width: CGFloat) -> TimeInterval {
        guard width > 0 else { return 0 }
        return totalDuration * Double(x / width)
    }
}

// MARK: - Waveform Shapes

/// Filled waveform (mirrored top/bottom)
struct WaveformShape: Shape {
    let data: [Float]
    
    func path(in rect: CGRect) -> Path {
        guard data.count > 1 else { return Path() }
        
        let midY = rect.midY
        let maxAmp = data.max() ?? 1.0
        let norm: Float = maxAmp > 0 ? maxAmp : 1.0
        let step = rect.width / CGFloat(data.count - 1)
        
        var path = Path()
        
        // Top half
        path.move(to: CGPoint(x: 0, y: midY))
        for (i, sample) in data.enumerated() {
            let x = CGFloat(i) * step
            let amp = CGFloat(sample / norm) * (rect.height * 0.45)
            path.addLine(to: CGPoint(x: x, y: midY - amp))
        }
        
        // Bottom half (reverse)
        for (i, sample) in data.enumerated().reversed() {
            let x = CGFloat(i) * step
            let amp = CGFloat(sample / norm) * (rect.height * 0.45)
            path.addLine(to: CGPoint(x: x, y: midY + amp))
        }
        
        path.closeSubpath()
        return path
    }
}

/// Waveform center line only (top half)
struct WaveformLineShape: Shape {
    let data: [Float]
    
    func path(in rect: CGRect) -> Path {
        guard data.count > 1 else { return Path() }
        
        let midY = rect.midY
        let maxAmp = data.max() ?? 1.0
        let norm: Float = maxAmp > 0 ? maxAmp : 1.0
        let step = rect.width / CGFloat(data.count - 1)
        
        var path = Path()
        path.move(to: CGPoint(x: 0, y: midY - CGFloat(data[0] / norm) * rect.height * 0.45))
        
        for i in 1..<data.count {
            let x = CGFloat(i) * step
            let amp = CGFloat(data[i] / norm) * (rect.height * 0.45)
            path.addLine(to: CGPoint(x: x, y: midY - amp))
        }
        
        return path
    }
}
