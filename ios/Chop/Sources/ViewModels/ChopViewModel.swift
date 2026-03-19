import SwiftUI
import UniformTypeIdentifiers
import Observation

@Observable
final class ChopViewModel {
    let audioEngine = AudioEngine()
    
    var showFilePicker = false
    var activePadIndex: Int?
    
    func setup() {
        audioEngine.setup()
    }
    
    func loadFile(url: URL) {
        Task {
            let accessing = url.startAccessingSecurityScopedResource()
            defer {
                if accessing { url.stopAccessingSecurityScopedResource() }
            }
            await audioEngine.loadAndChop(url: url)
        }
    }
    
    func tapPad(_ sample: Sample) {
        activePadIndex = sample.id
        audioEngine.playSample(sample)
        
        // Brief visual feedback
        Task {
            try? await Task.sleep(for: .milliseconds(150))
            if activePadIndex == sample.id {
                activePadIndex = nil
            }
        }
    }
}
