(function(t){function e(e){for(var i,s,o=e[0],u=e[1],c=e[2],f=0,p=[];f<o.length;f++)s=o[f],a[s]&&p.push(a[s][0]),a[s]=0;for(i in u)Object.prototype.hasOwnProperty.call(u,i)&&(t[i]=u[i]);l&&l(e);while(p.length)p.shift()();return r.push.apply(r,c||[]),n()}function n(){for(var t,e=0;e<r.length;e++){for(var n=r[e],i=!0,o=1;o<n.length;o++){var u=n[o];0!==a[u]&&(i=!1)}i&&(r.splice(e--,1),t=s(s.s=n[0]))}return t}var i={},a={app:0},r=[];function s(e){if(i[e])return i[e].exports;var n=i[e]={i:e,l:!1,exports:{}};return t[e].call(n.exports,n,n.exports,s),n.l=!0,n.exports}s.m=t,s.c=i,s.d=function(t,e,n){s.o(t,e)||Object.defineProperty(t,e,{enumerable:!0,get:n})},s.r=function(t){"undefined"!==typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(t,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(t,"__esModule",{value:!0})},s.t=function(t,e){if(1&e&&(t=s(t)),8&e)return t;if(4&e&&"object"===typeof t&&t&&t.__esModule)return t;var n=Object.create(null);if(s.r(n),Object.defineProperty(n,"default",{enumerable:!0,value:t}),2&e&&"string"!=typeof t)for(var i in t)s.d(n,i,function(e){return t[e]}.bind(null,i));return n},s.n=function(t){var e=t&&t.__esModule?function(){return t["default"]}:function(){return t};return s.d(e,"a",e),e},s.o=function(t,e){return Object.prototype.hasOwnProperty.call(t,e)},s.p="";var o=window["webpackJsonp"]=window["webpackJsonp"]||[],u=o.push.bind(o);o.push=e,o=o.slice();for(var c=0;c<o.length;c++)e(o[c]);var l=u;r.push([0,"chunk-vendors"]),n()})({0:function(t,e,n){t.exports=n("56d7")},"034f":function(t,e,n){"use strict";var i=n("64a9"),a=n.n(i);a.a},"096e":function(t,e,n){t.exports=n.p+"img/breakfast.d635b72b.png"},"0ea3":function(t,e,n){t.exports=n.p+"img/bus.39449762.png"},"11e0":function(t,e,n){t.exports=n.p+"img/progress.da6ac52f.png"},"31f2":function(t,e,n){"use strict";var i=n("ec41"),a=n.n(i);a.a},3703:function(t,e,n){},"56d7":function(t,e,n){"use strict";n.r(e);n("cadf"),n("551c"),n("f751"),n("097d");var i=n("2b0e"),a=function(){var t=this,e=t.$createElement,n=t._self._c||e;return n("div",{attrs:{id:"app"}},[n("HelloWorld",{attrs:{msg:"Good morning"}})],1)},r=[],s=function(){var t=this,e=t.$createElement,n=t._self._c||e;return n("div",{staticClass:"hello"},[n("h1",[t._v(t._s(t.msg))]),t._l(t.states,function(e){return n("state",{key:e.image,attrs:{active:e.active,state:e},on:{"state-change":t.displayMessage}})}),n("audio",{attrs:{src:t.publicPath+"ding.mp3",id:"audio"}}),n("ul",{attrs:{id:"messages"}},t._l(t.messages,function(e){return n("li",[t._v("\n      "+t._s(e)+"\n    ")])}),0),n("div",[n("button",{on:{click:t.testButtonClicked}},[t._v(t._s(t.stepLabel))])])],2)},o=[],u=(n("ac6a"),function(){var t=this,e=t.$createElement,i=t._self._c||e;return i("img",{staticClass:"state",class:{active:t.isActive},attrs:{src:n("9e01")("./"+t.state.image+".png"),id:"wakeup"}})}),c=[],l={name:"State",props:{state:Object,active:Boolean},computed:{isActive:function(){return this.state.active}},watch:{active:function(t,e){!e&&t&&this.$emit("state-change",this.state.label)}}},f=l,p=(n("994d"),n("2877")),g=Object(p["a"])(f,u,c,!1,null,null,null),h=g.exports,d={name:"HelloWorld",components:{State:h},props:{msg:String},data:function(){return{now:new Date,timeOffset:0,messages:[],publicPath:"",states:[{image:"wakeup",time:550,active:!1,label:"wake up"},{image:"toothbrushing",time:610,active:!1,label:"brush teeth"},{image:"breakfast",time:620,active:!1,label:"eat breakfast"},{image:"hairbrushing",time:630,active:!1,label:"brush hair"},{image:"bus",time:645,active:!1,label:"go to the bus"}]}},computed:{stepLabel:function(){return 0==this.inactive.length?"Reset":"Test next step"},time:function(){return 100*this.now.getHours()+this.now.getMinutes()},inactive:function(){return this.states.filter(function(t){return!t.active})}},methods:{displayMessage:function(t){this.messages.unshift("Time to ".concat(t,"!")),this.playSound()},playSound:function(){document.getElementById("audio").play()},testButtonClicked:function(t){if(0==this.inactive.length)return this.resetSteps();this.inactive[0].active=!0},resetSteps:function(){this.messages=[],this.states.forEach(function(t){t.active=!1})},isLaterInTheDay:function(){return this.time-this.states[0].time>200},updateState:function(){var t=this;this.inactive.forEach(function(e){var n=e.time+t.timeOffset;n<=t.time&&!t.isLaterInTheDay()&&(e.active=!0)})}},created:function(){var t=this;this.sound=document.getElementById("audio"),this.interval=setInterval(function(){t.now=new Date,t.updateState()},1e3)}},m=d,v=(n("31f2"),Object(p["a"])(m,s,o,!1,null,null,null)),b=v.exports,y={name:"app",components:{HelloWorld:b}},w=y,_=(n("034f"),Object(p["a"])(w,a,r,!1,null,null,null)),O=_.exports;i["a"].config.productionTip=!1,new i["a"]({render:function(t){return t(O)}}).$mount("#app")},"64a9":function(t,e,n){},"6a0f":function(t,e,n){t.exports=n.p+"img/hairbrushing.858dc8bf.png"},"7cc8":function(t,e,n){t.exports=n.p+"img/toothbrushing.d6c08c99.png"},"994d":function(t,e,n){"use strict";var i=n("3703"),a=n.n(i);a.a},"9e01":function(t,e,n){var i={"./breakfast.png":"096e","./bus.png":"0ea3","./hairbrushing.png":"6a0f","./logo.png":"cf05","./progress.png":"11e0","./toothbrushing.png":"7cc8","./wakeup.png":"a46f"};function a(t){var e=r(t);return n(e)}function r(t){var e=i[t];if(!(e+1)){var n=new Error("Cannot find module '"+t+"'");throw n.code="MODULE_NOT_FOUND",n}return e}a.keys=function(){return Object.keys(i)},a.resolve=r,t.exports=a,a.id="9e01"},a46f:function(t,e,n){t.exports=n.p+"img/wakeup.d99570ca.png"},cf05:function(t,e,n){t.exports=n.p+"img/logo.82b9c7a5.png"},ec41:function(t,e,n){}});
//# sourceMappingURL=app.29b7df13.js.map