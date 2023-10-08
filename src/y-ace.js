/**
 * @module bindings/ace
 */

import { createMutex } from 'lib0/mutex.js'
import * as Y from 'yjs' // eslint-disable-line
import { Awareness } from 'y-protocols/awareness.js' // eslint-disable-line
import Ace from 'ace-builds/src-min-noconflict/ace'
const Range = Ace.require('ace/range').Range


/*
  AceCursors // cc teddavis.org 2021
  Small class for tracking cursors/selection in Ace Editor
 */
class AceCursors{
  constructor(ace, bindings){
    this.ace = ace
    this.bindings = bindings
    this.aceID = this.ace.container.id

    this.marker = {}
    this.marker.self = this
    this.markerID = {}
    this.marker.cursors = []
    this.marker.update = function(html, markerLayer, session, config) {
      let start = config.firstRow, end = config.lastRow
      let cursors = this.cursors

      for (let i = 0; i < cursors.length; i++) {
        let pos = this.cursors[i]
        if (pos.row < start) {
          continue
        } else if (pos.row > end) {
          break
        } else {
          // compute cursor position on screen
          // this code is based on ace/layer/marker.js
          let screenPos = session.documentToScreenPosition(pos.row, pos.column)
          let aceGutter = document.getElementsByClassName('ace_gutter')[0].offsetWidth
          let height = config.lineHeight
          let width = config.characterWidth
          let top = markerLayer.$getTop(screenPos.row, config)
          let left = markerLayer.$padding + aceGutter + screenPos.column * width

          // draw cursor and flag
          let el = document.getElementById(this.self.aceID + '_cursor_' + pos.id)
          if(el == undefined){
            el = document.createElement('div')
            el.id = this.self.aceID + '_cursor_' + pos.id
            el.className = 'cursor'
            el.style.position = 'absolute'
            el.style['pointer-events'] = 'none'
            el.style.zIndex = 100
            el.style.opacity = 0.5
            el.style.background = pos.color
            el.style.color = pos.color
            el.style.border = '0'
            el.style.width = "3px"
            this.self.ace.container.appendChild(el)
          }
          el.style.height = height + 'px'
          el.style.top = top + 'px'
          el.style.left = (left-2) + 'px'
        }
      }

    }

    this.marker.redraw = function() {
      this.session._signal('changeFrontMarker')
    }

    this.marker.session = this.ace.getSession()
    this.marker.session.addDynamicMarker(this.marker, true)
  }

  updateCursors(cur, cid){
    if (cid == this.bindings.doc.clientID) return;

    if(cur !== undefined && cur.hasOwnProperty('cursor') && cur.hasOwnProperty('editorName') && cur.editorName == this.bindings.editorName){
      let c = cur.cursor
      let pos = this.ace.getSession().doc.indexToPosition(c.pos)

      let curCursor = {row:pos.row, column:pos.column, color:c.color, id:c.id, name:c.name}

       // handle selection
       if(c.sel){
        if(this.markerID[c.id] !== undefined && this.markerID[c.id].hasOwnProperty('sel') && this.markerID[c.id].sel !== undefined){
          this.ace.session.removeMarker(this.markerID[c.id].sel)
          this.markerID[c.id].sel = undefined
        }

        let anchor = this.ace.getSession().doc.indexToPosition(c.anchor)
        let head = this.ace.getSession().doc.indexToPosition(c.head)

        if(!document.getElementById('style_' + c.id)){
          let style = document.createElement('style')
          style.type = 'text/css'
          style.id = 'style_' + c.id
          document.getElementsByTagName('head')[0].appendChild(style)
        }
        let customStyle = document.getElementById('style_' + c.id)
        customStyle.innerHTML = '.selection-' + c.id + ' { position: absolute; z-index: 20; opacity: 0.3; pointer-events:none; cursor:auto; background: '+c.color+'; }'

        this.markerID[c.id] = {id:c.id, sel:this.ace.session.addMarker(new Range(anchor.row, anchor.column, head.row, head.column), 'selection-' + c.id, 'text')}
      }else{
        if(this.markerID[c.id] !== undefined && this.markerID[c.id].hasOwnProperty('sel') && this.markerID[c.id].sel !== undefined){
          // console.log("clear")
          this.ace.session.removeMarker(this.markerID[c.id].sel)
          this.markerID[c.id].sel = undefined
        }
      }

      this.marker.cursors.push(curCursor)

      let el = document.getElementById(this.aceID + '_cursor_'+cid)
      if (el) {
        el.style["cursor"] = "auto"
        el.style["pointer-events"] = "none"
      }

    }else{
      let el = document.getElementById(this.aceID + '_cursor_'+cid)
      if(el){
        el.parentNode.removeChild(el)
        if(this.markerID[cid] !== undefined && this.markerID[cid].hasOwnProperty('sel') && this.markerID[cid].sel !== undefined){
          this.ace.session.removeMarker(this.markerID[cid].sel)
          this.markerID[cid].sel = undefined
        }
      }
    }
  }
}


export class AceBinding {
  /**
   * @param {any} ace
   * @param {Awareness} [awareness]
   */
  constructor (editorName, doc, ace, awareness) {
    const mux = createMutex()
    this.mux = mux
    this.editorName = editorName
    this.doc = doc
    this.ace = ace
    this.ace.session.getUndoManager().reset()
    this.aceCursors = new AceCursors(this.ace, this)
    this.awareness = awareness
    this.updatingCursors = false

    this.setEditorName = (newEditorName) => {
      this.editorName = newEditorName
      let curs = this.aceCursors
      function updateCurs(value, key, map) {
        curs.updateCursors(value, key)
      }
      if (curs) {
        this.awareness.getStates().forEach(updateCurs)
      }
      this._cursorObserver()
    }

    this._awarenessChange = ({ added, removed, updated }) => {
      this.aceCursors.marker.cursors = []
      const states = /** @type {Awareness} */ (this.awareness).getStates()
      this.updatingCursors = true
      added.forEach(id => {
        this.aceCursors.updateCursors(states.get(id), id)
      })
      updated.forEach(id => {
        this.aceCursors.updateCursors(states.get(id), id)
      })
      removed.forEach(id => {
        this.aceCursors.updateCursors(states.get(id), id)
      })

      this.aceCursors.marker.redraw()
      this.updatingCursors = false
    }

    this._cursorObserver = () => {
      this._updateForCursorChange(false)
    }

    this._updateForCursorChange = (force) => {
      if (this.updatingCursors) return
      if (!this.ace.isFocused() && !force) return;

      let user = this.awareness.getLocalState().user
      let curSel = this.ace.getSession().selection
      let cursor = {id:doc.clientID, name:user.name, sel:true, color:user.color}

      let indexAnchor = this.ace.getSession().doc.positionToIndex(curSel.getSelectionAnchor())
      let indexHead = this.ace.getSession().doc.positionToIndex(curSel.getSelectionLead())
      cursor.anchor = indexAnchor
      cursor.head = indexHead

      // flip if selected right to left
      if(indexAnchor  > indexHead){
        cursor.anchor = indexHead
        cursor.head = indexAnchor
      }

      cursor.pos = cursor.head

      if(cursor.anchor === cursor.head){
        cursor.sel = false
      }

      const aw = /** @type {any} */ (this.awareness.getLocalState())
      if (curSel === null) {
        if (this.awareness.getLocalState() !== null) {
          let s = this.awareness.getLocalState()
          s.editorName = this.editorName
          s.cursor = null
          this.awareness.setLocalState(s)
        }
      } else {
        if (!aw || !aw.cursor || cursor.anchor !== aw.cursor.anchor || cursor.head  !== aw.cursor.head) {
          let s = this.awareness.getLocalState()
          s.editorName = this.editorName
          s.cursor = cursor
          this.awareness.setLocalState(s)
        }
      }
    }

    // update cursors
    this.ace.getSession().selection.on('changeCursor', this._cursorObserver)
    this._cursorObserver()

    if (this.awareness) {
      this.awareness.on('change', this._awarenessChange)
    }
  }

  destroy () {
    this.ace.getSession().selection.off('changeCursor', this._cursorObserver)
    if (this.awareness) {
      this.awareness.off('change', this._awarenessChange)
    }
  }
}
