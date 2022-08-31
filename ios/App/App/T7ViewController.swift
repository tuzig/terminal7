//
//  T7ViewController.swift
//  App
//
//  Created by Benny Daon on 31/07/2022.
//

import UIKit
import Capacitor


class T7ViewController: CAPBridgeViewController {
    @objc func sendMetaKey(key: String) {
        self.webView?.evaluateJavaScript(
            String(format: """
            if (window.terminal7.activeG) {
                p = window.terminal7.activeG.activeW.activeP;
                const e = new KeyboardEvent('keypress', {key: "%@" , metaKey: true});
                console.log("sending event", e, p.t.textarea);
                p.t.textarea.dispatchEvent(e);
            } else
                console.log("no active gate");
            """, key)
        )
    }
    @objc func copyMode() {
        sendMetaKey(key:"[")
    }
    @objc func zoom() {
        sendMetaKey(key:"z")
    }
    @objc func upArrow() {
        sendMetaKey(key:"ArrowUp")
    }
    @objc func downArrow() {
        sendMetaKey(key:"ArrowDown")
    }
    @objc func leftArrow() {
        sendMetaKey(key:"ArrowLeft")
    }
    @objc func rightArrow() {
        sendMetaKey(key:"ArrowRight")
    }
    @objc func find() {
        sendMetaKey(key:"f")
    }
    @objc func resetConnection() {
        sendMetaKey(key:"r")
    }
    @objc func dump() {
        sendMetaKey(key:"9")
    }
    @objc func closeTab() {
        sendMetaKey(key:"d")
    }
    @objc func toggleLog() {
        sendMetaKey(key:"l")
    }
    @objc func newTab() {
        sendMetaKey(key:"t")
    }
    @objc func renameTab() {
        sendMetaKey(key:",")
    }
    @objc func hSplit() {
        sendMetaKey(key:"\"")
    }
    @objc func vSplit() {
        sendMetaKey(key:"%")
    }
    @objc func resetFont() {
        sendMetaKey(key:"0")
    }
    @objc func smallerFont() {
        sendMetaKey(key:"-")
    }
    @objc func biggerFont() {
        sendMetaKey(key:"=")
    }

     override var keyCommands: [UIKeyCommand]? {
        return [
            UIKeyCommand(input: "[",
                         modifierFlags: .command,
                         action: #selector(copyMode),
                         discoverabilityTitle: "Copy Mode"),
            UIKeyCommand(input: "z",
                         modifierFlags: .command,
                         action: #selector(zoom),
                         discoverabilityTitle: "Toggle Zoom"),
            UIKeyCommand(input: UIKeyCommand.inputUpArrow,
                         modifierFlags: .command,
                         action: #selector(upArrow),
                         discoverabilityTitle: "Move Focus Up"),
            UIKeyCommand(input: UIKeyCommand.inputDownArrow,
                         modifierFlags: .command,
                         action: #selector(downArrow),
                         discoverabilityTitle: "Move Focus Down"),
            UIKeyCommand(input: UIKeyCommand.inputLeftArrow,
                         modifierFlags: .command,
                         action: #selector(leftArrow),
                         discoverabilityTitle: "Move Focus Left"),
            UIKeyCommand(input: UIKeyCommand.inputRightArrow,
                         modifierFlags: .command,
                         action: #selector(rightArrow),
                         discoverabilityTitle: "Move Focuse Right"),
            UIKeyCommand(input: "f",
                         modifierFlags: .command,
                         action: #selector(find),
                         discoverabilityTitle: "Search Buffer"),
            UIKeyCommand(input: "r",
                         modifierFlags: .command,
                         action: #selector(resetConnection),
                         discoverabilityTitle: "Reset Connection"),
            UIKeyCommand(input: "9",
                         modifierFlags: .command,
                         action: #selector(dump),
                         discoverabilityTitle: "Dump Log to Clipboard"),
            UIKeyCommand(input: "d",
                         modifierFlags: .command,
                         action: #selector(closeTab),
                         discoverabilityTitle: "Close Pane"),
            UIKeyCommand(input: "l",
                         modifierFlags: .command,
                         action: #selector(toggleLog),
                         discoverabilityTitle: "Toggle Log"),
            UIKeyCommand(input: "t",
                         modifierFlags: .command,
                         action: #selector(newTab),
                         discoverabilityTitle: "New Tab"),
            UIKeyCommand(input: ",",
                         modifierFlags: .command,
                         action: #selector(renameTab),
                         discoverabilityTitle: "Rename Tab"),
            UIKeyCommand(input: "\"",
                         modifierFlags: .command,
                         action: #selector(hSplit),
                         discoverabilityTitle: "Horizontal Split"),
            UIKeyCommand(input: "%",
                         modifierFlags: .command,
                         action: #selector(vSplit),
                         discoverabilityTitle: "Vertical Split"),
            UIKeyCommand(input: "0",
                         modifierFlags: .command,
                         action: #selector(resetFont),
                         discoverabilityTitle: "Reset Font"),
            UIKeyCommand(input: "-",
                         modifierFlags: .command,
                         action: #selector(smallerFont),
                         discoverabilityTitle: "Smaller Font"),
            UIKeyCommand(input: "=",
                         modifierFlags: .command,
                         action: #selector(biggerFont),
                         discoverabilityTitle: "Bigger Font")
        ]
    }
    override func viewDidLoad() {
        super.viewDidLoad()

        // Do any additional setup after loading the view.
    }


}
